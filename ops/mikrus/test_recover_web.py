import copy
import importlib.util
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("recovery", Path(__file__).with_name("recover-web.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name)
        self.info = {
            "Id": "original", "RestartCount": 0,
            "Config": {"Image": "web:test", "Cmd": ["node"],
                       "Labels": {recovery.LABEL: "true"}, "Env": ["SECRET=private"]},
            "State": {"Status": "running", "Paused": False, "StartedAt": "first",
                      "Health": {"Status": "unhealthy"}},
        }

    def run_recovery(self, inspections):
        with patch.object(recovery, "STATE", self.state), \
             patch.object(recovery, "inspect", side_effect=inspections), \
             patch.object(recovery, "capture"), \
             patch.object(recovery, "docker") as docker:
            result = recovery.recover()
            return result, docker

    def test_restarts_unhealthy_and_excludes_environment_from_evidence(self):
        result, docker = self.run_recovery([self.info] * 3)
        self.assertTrue(result)
        docker.assert_called_once_with("restart", "--timeout", "10", "original", timeout=40)
        saved = next(self.state.glob("incident-*/state.json")).read_text()
        self.assertNotIn("SECRET", saved)

    def test_leaves_healthy_starting_stopped_paused_and_unlabelled_alone(self):
        for status in ["healthy", "starting"]:
            info = copy.deepcopy(self.info)
            info["State"]["Health"]["Status"] = status
            result, docker = self.run_recovery([info])
            self.assertFalse(result)
            docker.assert_not_called()
        for mutation in ["stopped", "paused", "unlabelled"]:
            info = copy.deepcopy(self.info)
            if mutation == "stopped":
                info["State"]["Status"] = "exited"
            elif mutation == "paused":
                info["State"]["Paused"] = True
            else:
                info["Config"]["Labels"] = {}
            result, docker = self.run_recovery([info])
            self.assertFalse(result)
            docker.assert_not_called()

    def test_cooldown_prevents_restart_loop(self):
        (self.state / "last-attempt").touch()
        result, docker = self.run_recovery([self.info])
        self.assertFalse(result)
        docker.assert_not_called()

    def test_concurrent_rollout_is_not_restarted(self):
        replacement = copy.deepcopy(self.info)
        replacement["Id"] = "new-container"
        result, docker = self.run_recovery([self.info, replacement])
        self.assertFalse(result)
        docker.assert_not_called()

    def test_concurrent_manual_restart_is_not_restarted_again(self):
        replacement = copy.deepcopy(self.info)
        replacement["State"]["StartedAt"] = "second"
        result, docker = self.run_recovery([self.info, replacement])
        self.assertFalse(result)
        docker.assert_not_called()

    def test_recovered_or_manually_stopped_during_diagnostics_is_left_alone(self):
        stopped = copy.deepcopy(self.info)
        stopped["State"]["Status"] = "exited"
        result, docker = self.run_recovery([self.info, self.info, stopped])
        self.assertFalse(result)
        docker.assert_not_called()

    def test_failed_diagnostics_do_not_prevent_recovery(self):
        self.info["Config"]["Cmd"] = ["node", "--report-on-signal"]
        def docker_result(*args, **kwargs):
            if args[0] == "cp":
                raise subprocess.CalledProcessError(1, "docker cp")
            return ""
        with patch.object(recovery, "STATE", self.state), \
             patch.object(recovery, "inspect", return_value=self.info), \
             patch.object(recovery, "capture"), \
             patch.object(recovery.time, "sleep"), \
             patch.object(recovery.subprocess, "run", side_effect=subprocess.TimeoutExpired("inspector", 10)), \
             patch.object(recovery, "docker", side_effect=docker_result) as docker:
            self.assertTrue(recovery.recover())
            self.assertEqual(docker.call_args.args[:3], ("restart", "--timeout", "10"))


if __name__ == "__main__":
    unittest.main()
