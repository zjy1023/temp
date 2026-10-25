from fastapi.testclient import TestClient


def test_login_me_and_logout(client: TestClient, seed_data: dict) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": seed_data["ann_a1"], "password": "Passw0rd!"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "ANNOTATOR"
    assert body["tenant"]["name"] == "Alpha Test"

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == seed_data["ann_a1"]

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_wrong_password_and_role_guard(
    client: TestClient, seed_data: dict
) -> None:
    bad = client.post(
        "/api/auth/login",
        json={"email": seed_data["ann_a1"], "password": "wrong"},
    )
    assert bad.status_code == 401
    assert bad.json()["code"] == "UNAUTHENTICATED"

    response = client.post(
        "/api/auth/login",
        json={"email": seed_data["ann_a1"], "password": "Passw0rd!"},
    )
    assert response.status_code == 200
    forbidden = client.get("/api/admin/tenants")
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"


def test_platform_admin_can_list_tenants(
    client: TestClient, seed_data: dict
) -> None:
    response = client.post(
        "/api/auth/login",
        json={"email": seed_data["platform"], "password": "Passw0rd!"},
    )
    assert response.status_code == 200
    tenants = client.get("/api/admin/tenants")
    assert tenants.status_code == 200
    assert len(tenants.json()) == 2
