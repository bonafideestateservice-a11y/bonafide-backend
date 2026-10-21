const clientSendMail = jest.fn();
const clientSendMailWithTemplate = jest.fn();

jest.mock("../../libs/zeptomail/index", () => ({ clientSendMail, clientSendMailWithTemplate }));

import { EmailTemplate } from "../../libs/zeptomail/templates";
import { sendTemplateEmail } from "../../libs/zeptomail/zeptomail";

const to = { email: "ada@example.com", name: "Ada Okafor" };

describe("sendTemplateEmail", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends the welcome email as HTML, escaping user values", async () => {
    await sendTemplateEmail({
      to,
      content: {
        template: EmailTemplate.USER_REGISTERED,
        data: { firstName: "Ada <b>Okafor</b>", email: "ada@example.com" },
      },
    });

    expect(clientSendMailWithTemplate).not.toHaveBeenCalled();
    const [{ subject, htmlbody, email_address }] = clientSendMail.mock.calls[0];
    expect(email_address).toBe("ada@example.com");
    expect(subject).toBe("Welcome to Bonafide, Ada <b>Okafor</b>");
    expect(htmlbody).toContain("Hi Ada &lt;b&gt;Okafor&lt;/b&gt;,");
    expect(htmlbody).not.toContain("<b>Okafor</b>");
  });

  it("puts the reset code in the password reset email", async () => {
    await sendTemplateEmail({
      to,
      content: {
        template: EmailTemplate.FORGOT_PASSWORD,
        data: { firstName: "Ada", otp: "482913", resetLink: "482913", expiresIn: "10 minutes" },
      },
    });

    const [{ subject, htmlbody }] = clientSendMail.mock.calls[0];
    expect(subject).toBe("Your password reset code");
    expect(htmlbody).toContain("482913");
    expect(htmlbody).toContain("expires in 10 minutes");
  });

  it("puts the amount and references in the payment receipt", async () => {
    await sendTemplateEmail({
      to,
      content: {
        template: EmailTemplate.PAYMENT_RECEIVED,
        data: {
          firstName: "Ada",
          amount: "1,500.00",
          currency: "NGN",
          reference: "T4829",
          payment_receipt: "T4829",
          receipt_id: "txn-1",
          booking_ref: "vr-1",
          service_name: "Land Verification",
        },
      },
    });

    const [{ subject, htmlbody }] = clientSendMail.mock.calls[0];
    expect(subject).toBe("Payment received: NGN 1,500.00");
    expect(htmlbody).toEqual(expect.stringContaining("T4829"));
    expect(htmlbody).toEqual(expect.stringContaining("Land Verification"));
  });

  it("sends the other emails with their ZeptoMail template key", async () => {
    const data = {
      firstName: "Tunde",
      email: "tunde@example.com",
      setupCode: "482913",
      expiresIn: "48 hours",
      loginUrl: "",
    };
    await sendTemplateEmail({ to, content: { template: EmailTemplate.AGENT_WELCOME, data } });

    expect(clientSendMail).not.toHaveBeenCalled();
    expect(clientSendMailWithTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        mail_template_key: expect.stringMatching(/^2d6f\.1dce9259dff2e5d0\./),
        merge_info: data,
      }),
    );
  });
});
