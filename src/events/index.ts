import { EventEmitter } from "events";

export enum AppEventTypes {
  USER_REGISTERED = "USER_REGISTERED",
  USER_LOGIN = "USER_LOGIN",
  PAYMENT_RECEIVED = "PAYMENT_RECEIVED",
  FORGOT_PASSWORD = "FORGOT_PASSWORD",
}

class AppEvents extends EventEmitter {}

export const appEvents = new AppEvents();

import "./listeners";
