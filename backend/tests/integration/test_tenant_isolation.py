from fastapi.testclient import TestClient


def login(client: TestClient, email: str) -> None:
    response = client.post(
        "/api/auth/login", json={"email": email, "password": "Passw0rd!"}
    )
    assert response.status_code == 200, response.text


def test_annotator_cannot_see_other_tenant(
    client: TestClient, seed_data: dict
) -> None:
    login(client, seed_data["ann_b1"])

    tasks = client.get("/api/annotator/tasks").json()
    assert all(item["title"] != "A 任务" for item in tasks["available"])

    claim = client.post(f'/api/annotator/tasks/{seed_data["task_a"]}/claim')
    assert claim.status_code == 404

    stream = client.get(f'/api/videos/{seed_data["video_a"]}/stream')
    assert stream.status_code == 404


def test_tenant_admin_scope_and_platform_admin(
    client: TestClient, seed_data: dict
) -> None:
    login(client, seed_data["admin_a"])
    assert client.get(f'/api/admin/tasks/{seed_data["task_a"]}').status_code == 200
    assert client.get(f'/api/admin/tasks/{seed_data["task_b"]}').status_code == 404
    assert (
        client.get(
            "/api/admin/stats/daily",
            params={
                "from": "2026-10-01",
                "to": "2026-10-31",
                "tenant_id": seed_data["tenant_b"],
            },
        ).status_code
        == 404
    )

    client.post("/api/auth/logout")
    login(client, seed_data["platform"])
    tasks = client.get(
        "/api/admin/tasks", params={"tenant_id": seed_data["tenant_b"]}
    )
    assert tasks.status_code == 200
    assert any(item["title"] == "B 任务" for item in tasks.json()["tasks"])


def test_task_video_tenant_mismatch(
    client: TestClient, seed_data: dict
) -> None:
    login(client, seed_data["platform"])
    mismatch = client.post(
        "/api/admin/tasks",
        json={
            "tenant_id": str(seed_data["tenant_b"]),
            "video_id": str(seed_data["video_a"]),
            "title": "跨租户视频",
        },
    )
    assert mismatch.status_code == 422
    assert mismatch.json()["code"] == "TENANT_MISMATCH"

    client.post("/api/auth/logout")
    login(client, seed_data["admin_a"])
    hidden = client.post(
        "/api/admin/tasks",
        json={
            "video_id": str(seed_data["video_b"]),
            "title": "跨租户视频",
        },
    )
    assert hidden.status_code == 404
