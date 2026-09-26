export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export type IntegrationEvent<TType extends string = string, TData extends JsonObject = JsonObject> = {
  eventId: string;
  eventType: TType;
  aggregateType: string;
  aggregateId: string;
  data: TData;
};
