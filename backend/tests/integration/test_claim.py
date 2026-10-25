from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient

from app.main import app


def login(client: TestClient, email: str) -> None:
    response = client.post(
        "/api/auth/login", json={"email": email, "password": "Passw0rd!"}
    )
    assert response.status_code == 200, response.text


def test_claim_is_exclusive_and_release_returns_to_pool(
    client: TestClient, seed_data: dict
) -> None:
    login(client, seed_data["ann_a1"])
    first = client.post(f'/api/annotator/tasks/{seed_data["task_a"]}/claim')
    assert first.status_code == 200
    assignment_id = first.json()["assignment"]["id"]

    same = client.post(f'/api/annotator/tasks/{seed_data["task_a"]}/claim')
    assert same.status_code == 200
    assert same.json()["assignment"]["id"] == assignment_id

    client.post("/api/auth/logout")
    login(client, seed_data["ann_a2"])
    second = client.post(f'/api/annotator/tasks/{seed_data["task_a"]}/claim')
    assert second.status_code == 409
    assert second.json()["code"] == "ALREADY_CLAIMED"

    client.post("/api/auth/logout")
    login(client, seed_data["ann_a1"])
    release = client.post(
        f"/api/annotator/assignments/{assignment_id}/release"
    )
    assert release.status_code == 204

    available = client.get("/api/annotator/tasks").json()["available"]
    assert any(item["id"] == str(seed_data["task_a"]) for item in available)

    client.post("/api/auth/logout")
    login(client, seed_data["ann_a2"])
    reclaim = client.post(f'/api/annotator/tasks/{seed_data["task_a"]}/claim')
    assert reclaim.status_code == 200


def test_concurrent_claim_has_one_winner(
    client: TestClient, seed_data: dict
) -> None:
    # client fixture 已注册 get_db override；额外客户端共享同一个 override。
    first_client = client
    second_client = TestClient(app)
    login(first_client, seed_data["ann_a1"])
    login(second_client, seed_data["ann_a2"])

    def claim(current: TestClient) -> int:
        return current.post(
            f'/api/annotator/tasks/{seed_data["task_a"]}/claim'
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(claim, [first_client, second_client]))

    assert sorted(statuses) == [200, 409]
    second_client.close()


def test_admin_reassign_releases_old_assignment(
    client: TestClient, seed_data: dict
) -> None:
    login(client, seed_data["ann_a1"])
    claimed = client.post(f'/api/annotator/tasks/{seed_data["task_a"]}/claim')
    assert claimed.status_code == 200
    old_assignment_id = claimed.json()["assignment"]["id"]

    client.post("/api/auth/logout")
    login(client, seed_data["admin_a"])
    annotators = client.get("/api/admin/annotators").json()
    target = next(
        item for item in annotators if item["email"] == seed_data["ann_a2"]
    )
    reassigned = client.post(
        f'/api/admin/tasks/{seed_data["task_a"]}/reassign',
        json={"annotator_id": target["id"]},
    )
    assert reassigned.status_code == 200, reassigned.text
    assert reassigned.json()["assignment"]["annotator"]["display_name"] == "A 标注员 2"

    client.post("/api/auth/logout")
    login(client, seed_data["ann_a1"])
    old_detail = client.get(
        f"/api/annotator/assignments/{old_assignment_id}"
    )
    assert old_detail.status_code == 404
