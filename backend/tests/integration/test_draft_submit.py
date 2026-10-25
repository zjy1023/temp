from fastapi.testclient import TestClient


def login(client: TestClient, email: str) -> None:
    response = client.post(
        "/api/auth/login", json={"email": email, "password": "Passw0rd!"}
    )
    assert response.status_code == 200, response.text


def claim(client: TestClient, task_id: str) -> tuple[str, int]:
    response = client.post(f"/api/annotator/tasks/{task_id}/claim")
    assert response.status_code == 200, response.text
    body = response.json()
    return body["assignment"]["id"], body["assignment"]["version"]


def test_draft_validation_update_and_submit(
    client: TestClient, seed_data: dict
) -> None:
    login(client, seed_data["ann_a1"])
    assignment_id, version = claim(client, str(seed_data["task_a"]))

    draft = client.put(
        f"/api/annotator/assignments/{assignment_id}/draft",
        json={
            "version": version,
            "segments": [
                {"start_ms": 0, "end_ms": 1000},
                {"start_ms": 1000, "end_ms": 2000},
            ],
        },
    )
    assert draft.status_code == 200, draft.text
    body = draft.json()
    assert body["total_duration_ms"] == 2000
    assert body["version"] == version + 1
    segment_ids = [item["id"] for item in body["segments"]]
    assert len(segment_ids) == 2

    overlap = client.put(
        f"/api/annotator/assignments/{assignment_id}/draft",
        json={
            "version": body["version"],
            "segments": [
                {"start_ms": 0, "end_ms": 1500},
                {"start_ms": 1000, "end_ms": 2000},
            ],
        },
    )
    assert overlap.status_code == 422
    assert overlap.json()["code"] == "OVERLAP"

    stale = client.put(
        f"/api/annotator/assignments/{assignment_id}/draft",
        json={"version": version, "segments": []},
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "VERSION_CONFLICT"

    updated = client.put(
        f"/api/annotator/assignments/{assignment_id}/draft",
        json={
            "version": body["version"],
            "segments": [
                {"id": segment_ids[0], "start_ms": 100, "end_ms": 900},
                {"start_ms": 3000, "end_ms": 4000},
            ],
        },
    )
    assert updated.status_code == 200, updated.text
    updated_body = updated.json()
    assert updated_body["total_duration_ms"] == 1800
    assert any(item["id"] == segment_ids[0] for item in updated_body["segments"])

    submitted = client.post(
        f"/api/annotator/assignments/{assignment_id}/submit",
        json={"version": updated_body["version"], "confirm_empty": False},
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["total_duration_ms"] == 1800

    again = client.post(
        f"/api/annotator/assignments/{assignment_id}/submit",
        json={"version": updated_body["version"], "confirm_empty": False},
    )
    assert again.status_code == 409
    assert again.json()["code"] == "ALREADY_SUBMITTED"

    after_submit = client.put(
        f"/api/annotator/assignments/{assignment_id}/draft",
        json={"version": updated_body["version"], "segments": []},
    )
    assert after_submit.status_code == 409
    assert after_submit.json()["code"] == "ASSIGNMENT_NOT_EDITABLE"

    detail = client.get(f"/api/annotator/assignments/{assignment_id}")
    assert detail.status_code == 200
    assert detail.json()["assignment"]["status"] == "SUBMITTED"
    assert len(detail.json()["segments"]) == 2


def test_empty_submission_requires_confirmation(
    client: TestClient, seed_data: dict
) -> None:
    login(client, seed_data["ann_a2"])
    assignment_id, version = claim(client, str(seed_data["task_a"]))

    without_confirm = client.post(
        f"/api/annotator/assignments/{assignment_id}/submit",
        json={"version": version, "confirm_empty": False},
    )
    assert without_confirm.status_code == 422
    assert (
        without_confirm.json()["code"]
        == "EMPTY_SUBMISSION_CONFIRMATION_REQUIRED"
    )

    with_confirm = client.post(
        f"/api/annotator/assignments/{assignment_id}/submit",
        json={"version": version, "confirm_empty": True},
    )
    assert with_confirm.status_code == 200
    assert with_confirm.json()["total_duration_ms"] == 0
