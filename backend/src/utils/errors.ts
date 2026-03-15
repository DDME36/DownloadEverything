export class AppError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly suggestion?: string

  constructor(code: string, message: string, statusCode = 400, suggestion?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.suggestion = suggestion
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, suggestion?: string) {
    super('NOT_FOUND', message, 404, suggestion)
  }
}

export class PrivateContentError extends AppError {
  constructor(message: string, suggestion?: string) {
    super('PRIVATE_CONTENT', message, 403, suggestion)
  }
}

export class UnsupportedError extends AppError {
  constructor(message: string, suggestion?: string) {
    super('UNSUPPORTED', message, 400, suggestion)
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, suggestion?: string) {
    super('EXTERNAL_SERVICE_ERROR', message, 502, suggestion)
  }
}
