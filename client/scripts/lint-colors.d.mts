export interface ColorViolation {
  line: number
  column: number
  rule: string
  match: string
  hint: string
}

export function findColorViolations(text: string): ColorViolation[]
export const TOKEN_FILES: string[]
