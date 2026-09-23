import { SendMailClient } from "zeptomail";
import { AppEventTypes } from "../../events";
import { logger } from "../../utils/logger";

export type MergeInfoBuilder = (payload: any) => Record<string, any>;

export const appEventTypeToEmailConfig: Record<
  AppEventTypes,
  {
    templateKey: string;
    buildMergeInfo: MergeInfoBuilder;
  }
> = {
  [AppEventTypes.WELCOME_EMAIL]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.8ab2e850-00b4-11f1-b387-963d1902c9da.19c21a67b55",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
    }),
  },
  [AppEventTypes.OTP_CODE]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.689e2030-00b5-11f1-b387-963d1902c9da.19c21ac29b3",
    buildMergeInfo: (payload) => ({
      otp: payload.OTP_CODE,
    }),
  },
  [AppEventTypes.SEND_PAYMENT_LINK]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.b19a3ae0-01d6-11f1-b1c4-525400114fe6.19c2914058e",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      paymentLink: payload.paymentLink,
    }),
  },
  [AppEventTypes.FORGOT_PASSWORD]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.fee94bc1-01d5-11f1-b1c4-525400114fe6.19c290f7279",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      resetLink: payload.resetLink,
    }),
  },
  [AppEventTypes.OFFICER_ASSIGNED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.6f2bd430-0090-11f1-b387-963d1902c9da.19c20b9d8f3",
    buildMergeInfo: (payload) => ({
      phone_number: payload.phone,
      officer_name: payload.officer_name,
      airport: payload.airport,
    }),
  },
  [AppEventTypes.PAYMENT_RECEIVED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.254eb990-0086-11f1-b387-963d1902c9da.19c20766ba9",
    buildMergeInfo: (payload) => ({
      firstName: payload.firstName,
      amount: payload.amount,
      payment_receipt: payload.payment_receipt,
      booking_ref: payload.booking_ref,
      receipt_id: payload.receipt_id,
      currency: payload.currency,
      service_time: payload.service_time,
      trip_type: payload.trip_type,
      service_name: payload.service_name,
      service_date: payload.service_date,
      airport: payload.airport,
    }),
  },
  [AppEventTypes.PROTOCOL_ASSIGNMENT_ROUND_TRIP]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.3e2c9c82-0364-11f1-b1c4-525400114fe6.19c33416645",
    buildMergeInfo: (payload) => ({
      arrival_time: payload.arrival_time,
      departure_airport: payload.departure_airport,
      service_name: payload.service_name,
      departure_date: payload.departure_date,
      booking_ref: payload.booking_ref,
      arrival_airport: payload.arrival_airport,
      client_name: payload.client_name,
      arrival_date: payload.arrival_date,
      departure_time: payload.departure_time,
      officer_name: payload.officer_name,
    }),
  },
  [AppEventTypes.PROTOCOL_ASSIGNMENT_ONE_WAY]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.7abf5631-0213-11f1-b1c4-525400114fe6.19c2aa26313",
    buildMergeInfo: (payload) => ({
      service_time: payload.service_time,
      trip_type: payload.trip_type,
      service_name: payload.service_name,
      service_date: payload.service_date,
      booking_ref: payload.booking_ref,
      client_name: payload.client_name,
      officer_name: payload.officer_name,
      airport: payload.airport,
    }),
  },
  [AppEventTypes.STAFF_ASSIGNMENT]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.ab077db0-0383-11f1-b1c4-525400114fe6.19c340f590b",
    buildMergeInfo: (payload) => ({
      role: payload.role,
      first_name: payload.firstName,
      set_password_link: payload.setPasswordLink,
    }),
  },
  [AppEventTypes.BOOKING_COMPLETED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.bb85f7b0-0677-11f1-b1c4-525400114fe6.19c476a4aab",
    buildMergeInfo: (payload) => ({
      trip_date: payload.tripDate,
      booking_reference: payload.bookingReference,
      first_name: payload.firstName,
      officer_name: payload.officerName,
    }),
  },
  [AppEventTypes.ADMIN_REFUND_PROCESSED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.8ebaaed0-0760-11f1-b1c4-525400114fe6.19c4d60223d",
    buildMergeInfo: (payload) => ({
      trip_type: payload.tripType,
      service_name: payload.serviceName,
      booking_ref: payload.bookingReference,
      refund_amount: payload.refundAmount,
      currency: payload.currency,
      refund_method: payload.refundMethod,
      client_name: payload.clientName,
      refund_date: payload.refundDate,
    }),
  },
  [AppEventTypes.ADMIN_PROTOCOL_OFFICER_ASSIGNMENT]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.4207b3b1-075d-11f1-b1c4-525400114fe6.19c4d4a8261",
    buildMergeInfo: (payload) => ({
      service_time: payload.serviceTime,
      trip_type: payload.tripType,
      service_name: payload.serviceName,
      service_date: payload.serviceDate,
      booking_ref: payload.bookingReference,
      client_name: payload.clientName,
      officer_name: payload.officerName,
    }),
  },
  [AppEventTypes.ADMIN_BOOKING_CANCELLED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.eaeb3451-075a-11f1-b1c4-525400114fe6.19c4d3b2c12",
    buildMergeInfo: (payload) => ({
      service_time: payload.serviceTime,
      trip_type: payload.tripType,
      service_name: payload.serviceName,
      service_date: payload.serviceDate,
      booking_ref: payload.bookingReference,
      cancellation_reason: payload.cancellationReason,
      client_name: payload.clientName,
      officer_name: payload.officerName,
    }),
  },
  [AppEventTypes.ADMIN_BOOKING_COMPLETED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.cb6d7220-0758-11f1-b1c4-525400114fe6.19c4d2d4242",
    buildMergeInfo: (payload) => ({
      service_time: payload.serviceTime,
      trip_type: payload.tripType,
      service_name: payload.serviceName,
      service_date: payload.serviceDate,
      booking_ref: payload.bookingReference,
      client_name: payload.clientName,
      officer_name: payload.officerName,
    }),
  },
  [AppEventTypes.ADMIN_BOOKING_CONFIRMED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.3355a9f0-0756-11f1-b1c4-525400114fe6.19c4d1c420f",
    buildMergeInfo: (payload) => ({
      service_time: payload.serviceTime,
      trip_type: payload.tripType,
      service_name: payload.serviceName,
      service_date: payload.serviceDate,
      booking_ref: payload.bookingReference,
      client_name: payload.clientName,
      officer_name: payload.officerName,
    }),
  },
  [AppEventTypes.ADMIN_PAYMENT_RECEIVED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.a671f711-0754-11f1-b1c4-525400114fe6.19c4d1218fa",
    buildMergeInfo: (payload) => ({
      amount: payload.amount,
      service_name: payload.serviceName,
      booking_ref: payload.bookingReference,
      currency: payload.currency,
      client_name: payload.clientName,
      payment_method: payload.paymentMethod,
      payment_date: payload.paymentDate,
    }),
  },
  [AppEventTypes.TRAVEL_INSURANCE_DOMESTIC_POLICY_CONFIRMED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.00b08ff1-0d97-11f1-9038-525400114fe6.19c7617466b",
    buildMergeInfo: (payload) => ({
      end_date: payload.endDate,
      destination: payload.destination,
      policy_number: payload.policyNumber,
      currency: payload.currency,
      departure_city: payload.departureCity,
      coverage_amount: payload.coverageAmount,
      first_name: payload.firstName,
      plan_name: payload.planName,
      policy_document_link: payload.policyDocumentLink,
      start_date: payload.startDate,
    }),
  },
  [AppEventTypes.TRAVEL_INSURANCE_INTERNATIONAL_POLICY_CONFIRMED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.8fb7c700-0e04-11f1-9038-525400114fe6.19c78e54770",
    buildMergeInfo: (payload) => ({
      end_date: payload.endDate,
      destination_country: payload.destinationCountry,
      policy_number: payload.policyNumber,
      currency: payload.currency,
      coverage_amount: payload.coverageAmount,
      departure_country: payload.departureCountry,
      first_name: payload.firstName,
      plan_name: payload.planName,
      policy_document_link: payload.policyDocumentLink,
      start_date: payload.startDate,
    }),
  },
  [AppEventTypes.ADMIN_TRAVEL_INSURANCE_DOMESTIC_PAYMENT_LINK]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.21fab5a0-0e05-11f1-9038-525400114fe6.19c78e905fa",
    buildMergeInfo: (payload) => ({
      amount: payload.amount,
      end_date: payload.endDate,
      destination_country: payload.destinationCountry,
      policy_reference: payload.policyReference,
      currency: payload.currency,
      departure_country: payload.departureCountry,
      payment_link: payload.paymentLink,
      start_date: payload.startDate,
      first_name: payload.firstName,
    }),
  },
  [AppEventTypes.ADMIN_TRAVEL_INSURANCE_INTERNATIONAL_PAYMENT_LINK]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.51c9efd0-0e05-11f1-9038-525400114fe6.19c78ea3f4d",
    buildMergeInfo: (payload) => ({
      amount: payload.amount,
      end_date: payload.endDate,
      destination_country: payload.destinationCountry,
      policy_reference: payload.policyReference,
      currency: payload.currency,
      departure_country: payload.departureCountry,
      payment_link: payload.paymentLink,
      start_date: payload.startDate,
    }),
  },
  [AppEventTypes.TRAVEL_INSURANCE_DOMESTIC_PAYMENT_LINK]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.d59db191-1637-11f1-b6bb-525400d4bb1c.19caea31328",
    buildMergeInfo: (payload) => ({
      amount: payload.amount,
      end_date: payload.endDate,
      destination_country: payload.destinationCountry,
      policy_reference: payload.policyReference,
      currency: payload.currency,
      departure_country: payload.departureCountry,
      payment_link: payload.paymentLink,
      start_date: payload.startDate,
    }),
  },
  [AppEventTypes.TRAVEL_INSURANCE_INTERNATIONAL_PAYMENT_LINK]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.89871620-1637-11f1-b6bb-525400d4bb1c.19caea12082",
    buildMergeInfo: (payload) => ({
      amount: payload.amount,
      end_date: payload.endDate,
      destination_country: payload.destinationCountry,
      policy_reference: payload.policyReference,
      currency: payload.currency,
      departure_country: payload.departureCountry,
      payment_link: payload.paymentLink,
      start_date: payload.startDate,
    }),
  },
  [AppEventTypes.ADMIN_CREATE_PROTOCOL_OFFICER]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.10e940c1-29d9-11f1-a30e-963d1902c9da.19d2f486eca",
    buildMergeInfo: (payload) => ({
      phone_number: payload.phoneNumber,
      officer_name: payload.officerName,
      airport: payload.airport,
    }),
  },
  [AppEventTypes.CARGO_SHIPMENT_DELIVERED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.66804611-22df-11f1-8bd5-5254001dc20d.19d0191e4ec",
    buildMergeInfo: (payload) => ({
      delivery_date: payload.deliveryDate,
      origin: payload.origin,
      destination: payload.destination,
      receiver_name: payload.receiverName,
      sender_name: payload.senderName,
      first_name: payload.firstName,
      tacking_id: payload.name,
      tracking_link: payload.trackingLink,
    }),
  },
  [AppEventTypes.CARGO_SHIPMENT_PICKUP]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.87159d20-22bd-11f1-8bd5-5254001dc20d.19d00b3e7f2",
    buildMergeInfo: (payload) => ({
      ready_date: payload.readyDate,
      pickup_location: payload.location,
      origin: payload.origin,
      destination: payload.destination,
      sender_name: payload.senderName,
      first_name: payload.firstName,
      tracking_id: payload.trackingId,
      tracking_link: payload.trackingLink,
    }),
  },

  [AppEventTypes.CARGO_SHIPMENT_CANCELLED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.87159d20-22bd-11f1-8bd5-5254001dc20d.19d00b3e7f2",
    buildMergeInfo: (payload) => ({
      origin: payload.origin,
      cancelled_date: payload.cancelledDate,
      support_link: payload.supportLink,
      destination: payload.destination,
      receiver_name: payload.receiverName,
      sender_name: payload.senderName,
      first_name: payload.firstName,
      tracking_id: payload.trackingId,
    }),
  },
  [AppEventTypes.CARGO_PAYMENT_CONFIRMED]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.52a897e0-22bd-11f1-8bd5-5254001dc20d.19d00b2905e",
    buildMergeInfo: (payload) => ({
      origin: payload.origin,
      destination: payload.destination,
      receiver_name: payload.receiverName,
      sender_name: payload.senderName,
      estimated_delivery: payload.estimatedDelivery,
      first_name: payload.firstName,
      tracking_id: payload.trackingId,
      tracking_link: payload.trackingLink,
    }),
  },

  [AppEventTypes.CARGO_PAYMENT_LINK]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.79911890-2dc7-11f1-be2c-525400114fe6.19d490c0899",
    buildMergeInfo: (payload) => ({
      amount: payload.amount,
      service_type: payload.serviceType,
      origin: payload.origin,
      destination: payload.destination,
      currency: payload.currency,
      first_name: payload.firstName,
      tracking_id: payload.trackingId,
      payment_link: payload.paymentLink,
    }),
  },
  [AppEventTypes.CARGO_SHIPMENT_PROCESSING]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.f4580b90-2d15-11f1-be2c-525400114fe6.19d4480a2c9",
    buildMergeInfo: (payload) => ({
      origin: payload.origin,
      destination: payload.destination,
      receiver_name: payload.receiver,
      sender_name: payload.sender,
      first_name: payload.firstName,
      tracking_id: payload.trackingId,
      tracking_link: payload.trackingLink,
    }),
  },
  [AppEventTypes.CARGO_CUSTOM_CLEARANCE]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.fd514c10-2d16-11f1-be2c-525400114fe6.19d44876b51",
    buildMergeInfo: (payload) => ({
      origin: payload.origin,
      destination: payload.destination,
      receiver_name: payload.receiver,
      sender_name: payload.sender,
      first_name: payload.firstName,
      tracking_id: payload.trackingId,
      tracking_link: payload.trackingLink,
    }),
  },
  [AppEventTypes.CARGO_OUT_FOR_DELIVERY]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.1a334a30-2d18-11f1-be2c-525400114fe6.19d448eb653",
    buildMergeInfo: (payload) => ({
      delivery_address: payload.deliverAddress,
      receiver_name: payload.receiverName,
      first_name: payload.firstName,
      tracking_id: payload.trackingId,
      tracking_link: payload.trackingLink,
    }),
  },
  [AppEventTypes.CARGO_IN_TRANSIT]: {
    templateKey: "2d6f.f2423e0ada5619d.k1.98183611-2d16-11f1-be2c-525400114fe6.19d4484d3f1",
    buildMergeInfo: (payload) => ({
      origin: payload.origin,
      destination: payload.destination,
      receiver_name: payload.receiverName,
      sender_name: payload.senderName,
      first_name: payload.firstName,
      tracking_id: payload.trackingId,
      tracking_link: payload.trackingLink,
    }),
  },
};

const url = process.env.ZEPTO_URL || "api.zeptomail.com";
const token = process.env.ZEPTO_TOKEN!;
const client = new SendMailClient({ url, token });

const defaultFrom = {
  address: "noreply@juyonna.com",
  name: "noreply",
};

export async function clientSendMailWithTemplate({
  mail_template_key,
  email_address,
  name,
  merge_info,
}: {
  mail_template_key: string;
  email_address: string;
  name?: string;
  merge_info: Record<string, any>;
}) {
  try {
    const resp = await client.sendMailWithTemplate({
      mail_template_key,
      from: defaultFrom,
      to: [
        {
          email_address: {
            address: email_address,
            name: name || email_address,
          },
        },
      ],
      merge_info,
    });
    logger.info("ZeptoMail sent successfully", {
      to: email_address,
      mail_template_key,
      resp,
    });
    return resp;
  } catch (error: any) {
    logger.error("ZeptoMail send error", {
      to: email_address,
      mail_template_key,
      error,
    });
    throw error;
  }
}

export async function sendPasswordResetMail({
  email,
  name,
  otp,
}: {
  email: string;
  name: string;
  otp: string;
}) {
  try {
    await clientSendMailWithTemplate({
      mail_template_key:
        "2d6f.4e0c7a7494b9f61e.k1.6ad763e0-aa7d-11f0-a909-5254001dc20d.199eca1291e", // Replace with your actual ZeptoMail template key
      email_address: email,
      name,
      merge_info: {
        name,
        otp,
      },
    });
    logger.info("Password Resend email sent successfully", { to: email });
  } catch (error) {
    logger.error("Error sending OTP email:", error);
    throw error;
  }
}
