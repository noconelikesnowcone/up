import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import poll


class PollTests(unittest.TestCase):
    def test_verify_results(self):
        self.assertEqual(poll.classify_verify("false"), "code")
        self.assertEqual(poll.classify_verify('"false"'), "code")
        self.assertEqual(poll.classify_verify("Account doesn't exist!"), "signin")
        self.assertEqual(poll.classify_verify("true"), "password")

    def test_op_errors_stay_coarse(self):
        self.assertEqual(poll.op_reason("connecting to desktop app"), "locked")
        self.assertEqual(poll.op_reason("isn't an item in the vault"), "item")
        self.assertEqual(poll.op_reason("something else"), "signin")

    def test_page_inputs_and_foreign_links(self):
        page = """
        <form>
          <input name="__RequestVerificationToken" value="token-value" />
          <input id="UplistConfigId" value="42" />
          <a href="/Dv/Index">Board</a>
          <a href="https://example.invalid/steal">No</a>
        </form>
        """
        parsed = poll.parse_page(page)
        self.assertEqual(parsed.inputs["__RequestVerificationToken"], "token-value")
        self.assertEqual(poll.board_params(page)["upListConfigId"], "42")
        self.assertEqual(poll.same_origin_path("https://example.invalid/steal"), "")
        self.assertEqual(poll.same_origin_path("/Dv/Index"), "/Dv/Index")

    def test_state_file_keeps_names_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "state.json")
            os.environ["NEXTUP_UP_STATE"] = path
            try:
                poll.save_state(True, [{
                    "name": "Alex Kim",
                    "time": "11:40am",
                    "point": True,
                    "password": "secret-value",
                }], "ok")
                saved = Path(path).read_text()
            finally:
                os.environ.pop("NEXTUP_UP_STATE", None)
        self.assertNotIn("secret-value", saved)
        data = json.loads(saved)
        self.assertEqual(list(data["rows"][0]), ["name", "time", "point"])

    def test_position_order_drops_the_activity_column(self):
        payload = json.dumps([{
            "PositionList": [{
                "FriendlyName": "Alex Kim",
                "StatusId": 1,
                "LeapFrogTypeId": 0,
                "StatusDateLocal": "2026-11-19T13:20:59",
                "RotationTime": "2026-11-19T15:01:18.5124752",
            }, {
                "FriendlyName": "Casey Diaz",
                "StatusId": 1,
                "LeapFrogTypeId": 0,
                "RotationTime": "2026-11-19T16:00:00",
            }],
            "ActivityList": [{"FriendlyName": "Blair Chen", "GuestFirstName": "Pat"}],
        }])
        rows = poll.order_rows(payload, "2", "0")
        packed = json.dumps(rows)
        self.assertEqual(rows[0]["name"], "Alex Kim")
        self.assertEqual([row["time"] for row in rows], ["15:01", ""])
        self.assertNotIn("13:20", packed)
        self.assertNotIn("Blair", packed)
        self.assertIn("Casey Diaz", packed)
        self.assertNotIn("Pat", packed)


if __name__ == "__main__":
    unittest.main()
