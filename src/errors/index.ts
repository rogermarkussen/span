export class SpanError extends Error {
  constructor(
    message: string,
    public position: number,
    public line: number,
    public column: number
  ) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = 'SpanError';
  }
}

export class LexerError extends SpanError {
  constructor(message: string, position: number, line: number, column: number) {
    super(message, position, line, column);
    this.name = 'LexerError';
  }
}

export class ParseError extends SpanError {
  constructor(message: string, position: number, line: number, column: number) {
    super(message, position, line, column);
    this.name = 'ParseError';
  }
}

export class CodeGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeGenError';
  }
}
