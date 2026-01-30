import { Token, TokenType, KEYWORDS, OPERATORS } from './tokens.js';
import { LexerError } from '../errors/index.js';

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  let line = 1;
  let column = 1;

  function advance(count = 1): void {
    for (let i = 0; i < count; i++) {
      if (input[position] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      position++;
    }
  }

  function peek(offset = 0): string {
    return input[position + offset] || '';
  }

  function skipWhitespace(): void {
    while (position < input.length && /\s/.test(peek())) {
      advance();
    }
  }

  function readString(): string {
    const quote = peek();
    const startPos = position;
    const startLine = line;
    const startCol = column;
    advance(); // skip opening quote

    let value = '';
    while (position < input.length && peek() !== quote) {
      if (peek() === '\\' && (peek(1) === quote || peek(1) === '\\')) {
        advance();
      }
      value += peek();
      advance();
    }

    if (position >= input.length) {
      throw new LexerError('Unterminated string', startPos, startLine, startCol);
    }

    advance(); // skip closing quote
    return value;
  }

  function readNumber(): string {
    let value = '';
    while (position < input.length && /\d/.test(peek())) {
      value += peek();
      advance();
    }
    return value;
  }

  function readIdentifier(): string {
    let value = '';
    // Allow digits in identifiers (for 5g, 4g)
    while (position < input.length && /[a-zA-Z0-9_]/.test(peek())) {
      value += peek();
      advance();
    }
    return value;
  }

  function addToken(type: TokenType, value: string, startPos: number, startLine: number, startCol: number): void {
    tokens.push({ type, value, position: startPos, line: startLine, column: startCol });
  }

  while (position < input.length) {
    skipWhitespace();
    if (position >= input.length) break;

    const startPos = position;
    const startLine = line;
    const startCol = column;
    const char = peek();

    // Single character tokens
    if (char === '(') {
      addToken('LPAREN', '(', startPos, startLine, startCol);
      advance();
      continue;
    }

    if (char === ')') {
      addToken('RPAREN', ')', startPos, startLine, startCol);
      advance();
      continue;
    }

    if (char === ',') {
      addToken('COMMA', ',', startPos, startLine, startCol);
      advance();
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      const value = readString();
      addToken('STRING', value, startPos, startLine, startCol);
      continue;
    }

    // Numbers - but check for 5g/4g pattern first
    if (/\d/.test(char)) {
      // Look ahead to check if this is 5g or 4g
      if ((char === '5' || char === '4') && peek(1).toLowerCase() === 'g' && !/[a-zA-Z0-9_]/.test(peek(2))) {
        const value = char + peek(1).toLowerCase();
        addToken('IDENTIFIER', value, startPos, startLine, startCol);
        advance(2);
        continue;
      }

      const value = readNumber();
      addToken('NUMBER', value, startPos, startLine, startCol);
      continue;
    }

    // Operators
    if (char === '!' && peek(1) === '=') {
      addToken('OPERATOR', '!=', startPos, startLine, startCol);
      advance(2);
      continue;
    }

    if (char === '>' && peek(1) === '=') {
      addToken('OPERATOR', '>=', startPos, startLine, startCol);
      advance(2);
      continue;
    }

    if (char === '<' && peek(1) === '=') {
      addToken('OPERATOR', '<=', startPos, startLine, startCol);
      advance(2);
      continue;
    }

    if (OPERATORS.has(char)) {
      addToken('OPERATOR', char, startPos, startLine, startCol);
      advance();
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(char)) {
      const value = readIdentifier();
      const upper = value.toUpperCase();

      if (KEYWORDS.has(upper)) {
        addToken('KEYWORD', upper, startPos, startLine, startCol);
      } else {
        addToken('IDENTIFIER', value.toLowerCase(), startPos, startLine, startCol);
      }
      continue;
    }

    throw new LexerError(`Unexpected character: ${char}`, startPos, startLine, startCol);
  }

  addToken('EOF', '', position, line, column);
  return tokens;
}
