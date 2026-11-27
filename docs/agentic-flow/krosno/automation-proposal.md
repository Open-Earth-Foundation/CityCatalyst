# Krosno test case: automation proposal

A proposal, for Piotr to adapt. It describes how the Krosno test could run
without a person, so that every deploy of the document workspace gets the same
numbers. Nothing here is built yet.

## What we want to know after each run

Four measurements, agreed with Joaquin on 23 November 2026:

1. **Points.** For each of the 46 points in `eucf-template.json`: found and
   right, found and wrong, missed, or correctly flagged as missing.
2. **Draft text.** Whether each drafted form item means the same as what Krosno
   submitted, and whether anything was invented.
3. **The funder's rubric.** The draft scored on the evaluator's criteria, next
   to Krosno's real 20.50 out of 25. Indicative only (see limits).
4. **Effort.** How many questions the person had to answer, how many turns, and
   how long the run took.

## The pieces

### 1. A case folder the runner can read

This folder, plus the answer key:

- `eucf-template.json`: the points.
- `README.md` manifest: the documents, pinned by checksum. The runner checks
  the checksums before it starts and fails loudly on a mismatch.
- `answer-key.json` (to come), one entry per point:
  - what Krosno submitted, with a quote;
  - whether the documents of December 2021 contain it: `found`, `partly`,
    `not_found`, with file, page and a Polish quote;
  - what the person has to do: `confirm`, `bring_evidence`, `ask_someone`,
    `decide`;
  - the answer the scripted person gives when asked.
- A run configuration: which documents go in. The default is the fair replay,
  only what existed in December 2021.

### 2. A run through the API, without the browser

The workspace routes on this branch are enough to drive a whole run:

```text
create a run with the template
PUT  /concept-notes/{run_id}/setup
attach the documents                      (existing upload and document pool)
GET  /concept-notes/{run_id}/workspace    (poll until reading has settled)
POST /concept-notes/{run_id}/points/{point_key}/commands
POST /concept-notes/{run_id}/points/{point_key}/question
POST /concept-notes/{run_id}/exports
```

The runner saves the workspace after each stage, so a failure can be traced to
the stage where a fact was lost, the same idea as "Transfer" in the Builder
benchmark.

### 3. Scoring the points

Python does what can be checked exactly; a judge model does meaning, as in
`benchmark/cnb/golden_set/judge.py`.

| Check | Done by | Rule |
| --- | --- | --- |
| Status of each point | Python | The tool's state against the key: candidate found, nothing found, flagged as a gap |
| Numbers | Python | Equal after unit conversion; no tolerance unless the key states one |
| Source | Python | Same file, page within one of the key's page |
| Text values | Judge | Same meaning as the key, across Polish and English |
| Invented values | Judge | A value with no support in the cited page counts as wrong, never as found |

Reported per run: how many points fall in each of the four outcomes, plus
precision (of what it claimed, how much was right) and recall (of what was
there, how much it found). The outcome that matters most is "found and wrong":
the product promise is to name gaps, not to fill them.

### 4. A scripted person

After reading, the tool has a to-do list. A script plays the applicant:

- It answers only what the tool asks, using the key's answer for that point.
- For `bring_evidence` and `ask_someone` it uploads the matching file from a
  `simulated/` folder: realistic documents built from real Krosno data (for
  example the Mayor's order appointing the project team), clearly marked as
  simulated.
- For `decide` it gives Krosno's actual decision.
- It never volunteers information, so a point the tool forgets to ask about
  stays empty and shows up in the score.

It counts questions, turns and elapsed time. That is the effort measurement.

### 5. Scoring the draft

Once the points are settled the tool drafts the application.

- **Against Krosno's text:** per form item, a judge checks that the draft
  carries the same substance as the submitted answer and that every claim is
  supported by an accepted point. Six items have a public answer (2.3, 2.4,
  2.5, 3.2, 3.4, 3.5); the others are run but not scored.
- **Against the rubric:** a judge scores governance, stakeholder engagement and
  alignment (criteria B1 to B3) using the aspects printed in the evaluator's
  feedback.

### 6. One browser check

A single Playwright test in the style of `app/e2e/concept-note-*.spec.ts`: open
the Krosno run, attach a document, open To do, confirm one point, park one,
generate the draft, download the working export. It proves the screens still
work. It does not score anything.

## How to run it

- On demand and after each deploy to the test environment, against that
  environment's real storage, reading and model services.
- Three runs per version, reporting the middle result and the spread. One run
  is not a measurement.
- Results saved next to the Builder benchmark results and shown in its viewer,
  labelled with the commit.
- A budget per run (model calls and minutes), so a loop cannot run away.

## Limits to state in every report

- **Criteria A1 and A2 cannot be reproduced.** Investment size and energy
  savings were scored relative to the other applications in that call.
- **A judge's rubric score is not the evaluator's score.** It is reported
  beside 20.50, never as a prediction of it.
- **The public application is an extract.** It cites two attachments
  (`Project_Team_Krosno`, `Summary_Development_Plan`) that are not public.
- **The key has a human in it.** Points where the Polish is ambiguous are
  marked for Piotr to confirm before they count.

## Suggested order

1. Now: manual runs on the test environment with the template and the answer
   key, written up by hand. This also tells us what the runner must capture.
2. Sprint 130: the case folder complete (answer key, simulated files).
3. Sprint 131: the API runner and point scoring (the benchmark ticket CC-1301),
   then the scripted person and draft scoring.
4. Later: the same runner on the second grant, to measure how much carries
   over.

## Open questions for Piotr

1. How should a run be created from a template file? Today a template reaches a
   run through the funder import or the custom-template review.
2. The Builder benchmark takes one source document per case. Is it better to
   extend it to several documents, or to write a separate runner for the
   workspace?
3. Where does the workspace expose the page of the evidence behind a
   candidate? The source check needs it.
4. Item 3.1 needs a multi-select and Annex E a small table. Are those in
   scope, or do we keep the workaround in the template?
5. What does one full run cost in model calls and minutes on the test
   environment?
