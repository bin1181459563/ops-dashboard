import { getApiErrorMessage, unwrapApiArray, unwrapApiData, unwrapApiObject } from "../lib/apiEnvelope";

const arrayFromData = unwrapApiArray({ data: [1, 2, 3] });
const objectFromSuccess = unwrapApiObject({ success: true, data: { foo: "bar" } }, { foo: "" });
const arrayFromCode = unwrapApiArray({ code: 0, data: ["a", "b"] });
const directArray = unwrapApiArray(["x"]);
const directObject = unwrapApiObject({ alpha: 1 }, { alpha: 0 });
const fallbackArray = unwrapApiArray(null);
const fallbackData = unwrapApiData(undefined, "fallback");
const errorMessage = getApiErrorMessage({ message: "Request failed with status code 500" });

arrayFromData.length;
objectFromSuccess.foo.length;
arrayFromCode.length;
directArray.length;
directObject.alpha.toFixed(0);
fallbackArray.length;
fallbackData.toUpperCase();
errorMessage.toUpperCase();

export function ApiEnvelopeContract() {
  return null;
}
