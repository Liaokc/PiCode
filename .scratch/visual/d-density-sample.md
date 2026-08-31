Density calibration sample. The paragraph below wraps across at least two
lines at the default thread width so the line pitch inside a single block
can be measured: the quick brown fox jumps over the lazy dog and keeps
going until the line breaks somewhere around this part of the sentence.

- Single-line bullet one
- Single-line bullet two
- Single-line bullet three
- A longer bullet that carries inline code `register.ts` plus **bold** to
  mirror what real answers look like

1. First ordered item
2. Second ordered item

> A blockquote line for vertical rhythm reference.

### Heading three

| Column | Before | After |
| --- | --- | --- |
| Model | deepseek-v4-flash | GLM-5.3-flash |
| Provider | bella-8000 | bella |

Closing paragraph after the table. The gap above this sentence is the
paragraph pitch to calibrate against the reference.

```ts
export function parseRegistration(body: unknown): Registration {
  const { email, password } = RegistrationSchema.parse(body)
  return { email: email.trim().toLowerCase(), password: assertStrongPassword(password) }
}
```
