from app.models.crop import Crop


def test_list_crops(client, db_session):
    db_session.add(Crop(
        id="lettuce", name="Lettuce", category="Leafy Green",
        icon="🥬", accent="#9edb66", weeks_on_panel=5,
        nursery_lead_weeks=2, yield_per_grid=1.2, price_per_kg=4.0,
        seedlings_per_grid=80, tray_cell_count=200, germination_rate=0.95,
        prefers_edge=True, edge_weight=1.1, neighbor_bonus=2.0,
        nutrient_cost_per_grid_week=0.10, cost_per_seedling=0.02
    ))
    db_session.commit()
    resp = client.get("/crops")
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
    assert resp.json()[0]["id"] == "lettuce"
