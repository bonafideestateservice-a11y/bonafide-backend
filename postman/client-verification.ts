/**
 * Client verification endpoints with full URLs and request/response examples.
 * Deployed base: https://bonafide-backend-9mly.onrender.com
 *
 * In Postman, copy the URL, select the method, add the listed headers,
 * and use the response examples as the expected response contract.
 */

export interface ErrorResponse {
  status: "error";
  message: string;
}

export interface VerificationRequestResponse {
  id: string;
  title: string;
  verificationType: {
    name: string;
    icon: string | null;
  };
  status: string;
  updatedAt: string;
}

export interface VerificationReportSummaryResponse {
  unviewedReportsCount: number;
}

export interface ClientVerificationEndpoint {
  name: string;
  method: "GET";
  url: string;
  headers: Record<string, string>;
  queryParams?: Record<string, string>;
  requestBody: null;
  responseBody: object;
  errorResponses: Record<number, ErrorResponse>;
}

export const CLIENT_VERIFICATION_ENDPOINTS: ClientVerificationEndpoint[] = [
  {
    name: "Get Client Verification Requests",
    method: "GET",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/verification-requests?limit=5",
    headers: {
      Authorization: "Bearer <TOKEN_FROM_CLIENT_LOGIN>",
    },
    queryParams: {
      limit: "5",
    },
    requestBody: null,
    responseBody: [
      {
        id: "7f3b1e7a-0e2b-4e62-8b5b-4e6d7f8a9b10",
        title: "Passport verification",
        verificationType: {
          name: "Identity Verification",
          icon: "identity-card",
        },
        status: "PENDING",
        updatedAt: "2026-09-18T12:30:00.000Z",
      },
    ] satisfies VerificationRequestResponse[],
    errorResponses: {
      400: {
        status: "error",
        message: "Limit must be an integer between 1 and 50.",
      },
      401: {
        status: "error",
        message: "No token provided",
      },
      500: {
        status: "error",
        message: "Internal server error",
      },
    },
  },
  {
    name: "Get Client Verification Report Summary",
    method: "GET",
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/verification-requests/reports-summary",
    headers: {
      Authorization: "Bearer <TOKEN_FROM_CLIENT_LOGIN>",
    },
    requestBody: null,
    responseBody: {
      unviewedReportsCount: 2,
    } satisfies VerificationReportSummaryResponse,
    errorResponses: {
      401: {
        status: "error",
        message: "No token provided",
      },
      500: {
        status: "error",
        message: "Internal server error",
      },
    },
  },
];

/**
 * Copyable Postman request examples.
 * Both endpoints use GET and do not send a request body.
 */
export const POSTMAN_REQUESTS = {
  getVerificationRequests: {
    method: "GET" as const,
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/verification-requests?limit=5",
    headers: {
      Authorization: "Bearer <TOKEN_FROM_CLIENT_LOGIN>",
    },
    body: null,
  },
  getVerificationReportSummary: {
    method: "GET" as const,
    url: "https://bonafide-backend-9mly.onrender.com/api/v1/client/verification-requests/reports-summary",
    headers: {
      Authorization: "Bearer <TOKEN_FROM_CLIENT_LOGIN>",
    },
    body: null,
  },
};
