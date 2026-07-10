"use client"

import {
  TextField as AriaTextField,
  Label,
  Input,
  TextArea,
  FieldError,
  Text,
  type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components"

interface TextFieldProps extends AriaTextFieldProps {
  label?: string
  description?: string
  errorMessage?: string
  placeholder?: string
  multiline?: boolean
  rows?: number
}

const inputClass = `
  w-full h-9 px-3 text-sm text-text-1 bg-surface
  border border-border rounded transition-colors
  placeholder:text-text-3
  outline-none
  data-[focused]:border-[--border-focus] data-[focused]:ring-1 data-[focused]:ring-[--border-focus]
  data-[invalid]:border-[--error]
  data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed data-[disabled]:bg-[--bg-base]
`

const textareaClass = `
  w-full px-3 py-2 text-sm text-text-1 bg-surface
  border border-border rounded transition-colors resize-y
  placeholder:text-text-3
  outline-none
  data-[focused]:border-[--border-focus] data-[focused]:ring-1 data-[focused]:ring-[--border-focus]
  data-[invalid]:border-[--error]
  data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed
`

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  multiline = false,
  rows = 4,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField {...props} className="flex flex-col gap-1">
      {label && (
        <Label className="text-xs font-medium text-text-2">{label}</Label>
      )}
      {multiline ? (
        <TextArea
          rows={rows}
          placeholder={placeholder}
          className={textareaClass}
        />
      ) : (
        <Input placeholder={placeholder} className={inputClass} />
      )}
      {description && (
        <Text slot="description" className="text-xs text-text-3">
          {description}
        </Text>
      )}
      <FieldError className="text-xs text-[--error]">
        {errorMessage}
      </FieldError>
    </AriaTextField>
  )
}
