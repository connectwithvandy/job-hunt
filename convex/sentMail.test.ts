import { expect, test } from "vitest";
import { sentToContacts } from "./lib/sentMail";

test("an email sent to a contact marks them messaged, at the first send", () => {
  const contacts = [
    { jobId: "j1", contactId: "a", email: "Sam@Acme.com" },
    { jobId: "j1", contactId: "b", email: "pam@acme.com" },
  ];
  const sent = [
    { to: "Sam Lee <sam@acme.com>, hr@acme.com", at: 200 },
    { to: "sam@acme.com", at: 100 },
    { to: "xpam@acme.com.au", at: 50 },
  ];
  expect(sentToContacts(contacts, sent)).toEqual([{ jobId: "j1", contactId: "a", at: 100 }]);
});

test("nothing sent, nothing marked", () => {
  expect(sentToContacts([{ jobId: "j1", contactId: "a", email: "sam@acme.com" }], [])).toEqual([]);
});
