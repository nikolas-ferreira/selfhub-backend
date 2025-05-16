export const successResponse = (response: any, message?: string) => ({
  statusCode: 200,
  response,
  message: message || "Success",
});

export const errorResponse = (statusCode: number, message: string) => ({
  statusCode,
  response: null,
  message,
});

export const unauthorized = (message = "Unauthorized") =>
  errorResponse(401, message);

export const notFound = (message = "Not Found") =>
  errorResponse(404, message);

export const internalError = (message = "Internal Server Error") =>
  errorResponse(500, message);
