// Placeholder - will be replaced by Fulcrum's button component during sandbox initialization
import * as React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={className} {...props} />
}
