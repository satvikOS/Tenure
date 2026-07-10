"use client"

import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"
import { cva, type VariantProps } from "class-variance-authority"

const button = cva(
  [
    "inline-flex items-center justify-center gap-2 font-medium transition-colors cursor-default",
    "outline-none",
    "data-[focus-visible]:ring-2 data-[focus-visible]:ring-[--primary] data-[focus-visible]:ring-offset-1",
    "data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[--primary] text-white rounded",
          "data-[hovered]:bg-[--primary-hover]",
          "data-[pressed]:bg-[--primary-press]",
        ],
        secondary: [
          "bg-white text-[--text-1] border border-[--border] rounded",
          "data-[hovered]:bg-[--bg-base] data-[hovered]:border-[--border-strong]",
          "data-[pressed]:bg-gray-100",
        ],
        ghost: [
          "text-[--text-2] rounded",
          "data-[hovered]:bg-[--bg-base] data-[hovered]:text-[--text-1]",
          "data-[pressed]:bg-gray-100",
        ],
        destructive: [
          "bg-[--error] text-white rounded",
          "data-[hovered]:bg-red-800",
          "data-[pressed]:bg-red-900",
        ],
        link: [
          "text-[--text-link] underline-offset-4",
          "data-[hovered]:underline",
        ],
      },
      size: {
        sm: "h-7 px-3 text-xs",
        md: "h-9 px-4 text-sm",
        lg: "h-10 px-5 text-sm",
        icon: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends AriaButtonProps,
    VariantProps<typeof button> {
  className?: string
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className={button({ variant, size, className })}
    />
  )
}
