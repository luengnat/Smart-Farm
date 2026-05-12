def test_create_farm(client):
    resp = client.post("/farms", json={
        "name": "Green Farm", "location": "Bangkok", "rows": 4, "columns": 12,
        "growingSystem": "hydroponic", "nurseryTrayCount": 30,
        "nurseryTrayCells": 200, "nurseryBufferPercent": 10
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Green Farm"
    assert data["id"] is not None


def test_get_farm(client):
    create = client.post("/farms", json={
        "name": "Green Farm", "location": "Bangkok", "rows": 4, "columns": 12,
        "growingSystem": "hydroponic", "nurseryTrayCount": 30,
        "nurseryTrayCells": 200, "nurseryBufferPercent": 10
    })
    farm_id = create.json()["id"]
    resp = client.get(f"/farms/{farm_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Green Farm"


def test_update_farm(client):
    create = client.post("/farms", json={
        "name": "Green Farm", "location": "Bangkok", "rows": 4, "columns": 12,
        "growingSystem": "hydroponic", "nurseryTrayCount": 30,
        "nurseryTrayCells": 200, "nurseryBufferPercent": 10
    })
    farm_id = create.json()["id"]
    resp = client.put(f"/farms/{farm_id}", json={"name": "Updated Farm"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Farm"


def test_get_farm_not_found(client):
    resp = client.get("/farms/99999")
    assert resp.status_code == 404
