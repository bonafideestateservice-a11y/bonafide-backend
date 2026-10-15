import { getPropertyOptionsHandler } from "../../../../../api/admin/dashboard/handlers/get-property-options";
import { callHandler } from "../../../../helpers/http";

describe("getPropertyOptionsHandler (unit)", () => {
  it("returns every property type and amenity with a label", async () => {
    const { res } = await callHandler(getPropertyOptionsHandler);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.types).toEqual([
      { value: "HOUSE", label: "House" },
      { value: "APARTMENT", label: "Apartment" },
      { value: "LAND", label: "Land" },
      { value: "COMMERCIAL", label: "Commercial" },
    ]);
    expect(body.amenities).toContainEqual({ value: "ROAD_ACCESS", label: "Road Access" });
    expect(body.amenities).toContainEqual({ value: "AIR_CONDITIONING", label: "Air Conditioning" });
    expect(body.amenities).toHaveLength(9);
  });
});
