import io
from pathlib import Path
import tarfile
import tempfile
import unittest

from deploy import release_member
from remote import load_env


class DeploymentTests(unittest.TestCase):
    def test_upload_keeps_production_build_but_excludes_secrets_and_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            keep = ["web/.next/BUILD_ID", "web/.next/server/app.js", "web/package-lock.json", "ca/service/app.py"]
            exclude = ["web/.env", "web/.env.local", "ops/.env.mikrus", "web/.secrets.state",
                       "web/node_modules/private/index.js", "web/.next/cache/build.cache"]
            for name in keep + exclude:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("fixture")
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode="w") as archive:
                for name in ("web", "ca", "ops"):
                    archive.add(root / name, arcname=name, filter=release_member)
            buffer.seek(0)
            with tarfile.open(fileobj=buffer) as archive:
                names = archive.getnames()
            self.assertTrue(set(keep).issubset(names))
            self.assertTrue(set(exclude).isdisjoint(names))

    def test_credential_parser_preserves_quoted_metacharacters_without_expansion(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.mikrus"
            path.write_text("# private\nMIKRUS_PASSWORD='space $literal # character'\nCC_LOGIN_PASSWORD='$(do-not-run)'\n")
            values = load_env(path)
            self.assertEqual(values["MIKRUS_PASSWORD"], "space $literal # character")
            self.assertEqual(values["CC_LOGIN_PASSWORD"], "$(do-not-run)")


if __name__ == "__main__":
    unittest.main()
