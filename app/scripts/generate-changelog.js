import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import semver from 'semver';

function getSortedSemverTags() {
  const tags = execSync('git tag')
    .toString()
    .split('\n')
    .map(tag => tag.trim())
    .filter(tag => {
      const v = semver.coerce(tag);
      return v && semver.valid(v) && !semver.prerelease(v);
    });
  // Sort tags using semver precedence
  return tags.sort((a, b) => semver.rcompare(semver.coerce(a), semver.coerce(b)));
}

function getGitLogBetweenTags(fromTag, toTag) {
  return execSync(`git log --pretty=format:"%h %s" ${fromTag}..${toTag}`).toString();
}

async function generateChangelogEntry(log, version, date, apiKey) {
  const openai = new OpenAI({ apiKey });
  const prompt = `Convert the following git commit log into a human-friendly changelog entry in markdown, using the Keep a Changelog format. The version is ${version} and the date is ${date}. Only output the markdown for this version.\n\nGit log:\n${log}`;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that writes changelogs in Keep a Changelog format.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 600,
    temperature: 0.3,
  });
  return completion.choices[0].message.content || '';
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY not set in environment.');
    process.exit(1);
  }

  const [latestTag, previousTag] = getSortedSemverTags().slice(-2);
  if (!latestTag || !previousTag) {
    console.error('Not enough tags to generate changelog.');
    process.exit(1);
  }
  const log = getGitLogBetweenTags(previousTag, latestTag);
  if (!log.trim()) {
    console.log('No new commits since last release.');
    process.exit(0);
  }

  const newVersion = latestTag;
  const today = new Date().toISOString().split('T')[0];

  console.log(`Generating changelog for version ${newVersion} (changes from ${previousTag} to ${latestTag})`);
  const entry = await generateChangelogEntry(log, newVersion, today, apiKey);

  const changelogPath = path.resolve(process.cwd(), '../CHANGELOG.md');
  let changelog = fs.readFileSync(changelogPath, 'utf-8');

  // Insert after the first line (top of file)
  const lines = changelog.split('\n');
  // remove the beginning of codeblock (```markdown)
  lines.shift();
  // remove the end of codeblock (```)
  lines.pop();

  let entryClean = entry
    .split('\n')
    .filter(line => line.trim() !== '```markdown' && line.trim() !== '```')
    .join('\n');

  // Insert at the top
  lines.splice(0, 0, entryClean.trim(), '');
  fs.writeFileSync(changelogPath, lines.join('\n'));
  console.log('Changelog updated!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 