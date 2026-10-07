import request from "supertest";
import app from "../../../../../app";
import { prismaClient } from "../../../../../utils/prisma";
import { createFixtures } from "../../../../helpers/fixtures";

const fx = createFixtures("inbox");
let admin: Awaited<ReturnType<typeof fx.createUser>>;
let other: Awaited<ReturnType<typeof fx.createUser>>;
let mine: { id: string };

beforeAll(async () => {
  admin = await fx.createUser("ADMIN", "admin");
  other = await fx.createUser("ADMIN", "other");
  mine = await prismaClient.notification.create({
    data: {
      userId: admin.id,
      type: "PAYMENT_RECEIVED",
      title: "Payment received",
      meta: { channel: "in_app" },
    },
  });
  await prismaClient.notification.createMany({
    data: [
      // emails and other admins' notifications aren't in the inbox
      { userId: admin.id, type: "PAYMENT_RECEIVED", meta: { channel: "email" } },
      { userId: other.id, type: "PAYMENT_RECEIVED", meta: { channel: "in_app" } },
    ],
  });
});
afterAll(async () => {
  await fx.cleanup();
  await prismaClient.$disconnect();
});

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("admin notifications", () => {
  it("GET /notifications lists only the caller's in-app notifications", async () => {
    const response = await request(app).get("/api/v1/admin/notifications").set(as(admin.token));
    expect(response.status).toBe(200);
    expect(response.body.data.map((n: { id: string }) => n.id)).toEqual([mine.id]);
    expect(response.body).toMatchObject({ unreadCount: 1, meta: { page: 1, totalItems: 1 } });
  });

  it("PATCH /notifications/:id/read marks it read; another admin's id is 404", async () => {
    const read = await request(app)
      .patch(`/api/v1/admin/notifications/${mine.id}/read`)
      .set(as(admin.token));
    expect(read.status).toBe(200);
    const unread = await request(app)
      .get("/api/v1/admin/notifications?unreadOnly=true")
      .set(as(admin.token));
    expect(unread.body.data).toEqual([]);

    const notMine = await request(app)
      .patch(`/api/v1/admin/notifications/${mine.id}/read`)
      .set(as(other.token));
    expect(notMine.status).toBe(404);
  });

  it("PATCH /notifications/read-all clears the other admin's inbox", async () => {
    const response = await request(app)
      .patch("/api/v1/admin/notifications/read-all")
      .set(as(other.token));
    expect(response.body).toEqual({ updated: 1 });
    const inbox = await request(app).get("/api/v1/admin/notifications").set(as(other.token));
    expect(inbox.body.unreadCount).toBe(0);
  });

  it("requires a token", async () => {
    expect((await request(app).get("/api/v1/admin/notifications")).status).toBe(401);
  });
});
