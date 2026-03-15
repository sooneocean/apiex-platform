import * as Select from '@radix-ui/react-select'
import { ChevronDown, Check } from 'lucide-react'
import type { ApiKey } from '@/lib/api'

interface KeySelectorProps {
  keys: ApiKey[]
  value: string | null
  onSelect: (keyId: string | null) => void
  disabled?: boolean
}

export default function KeySelector({
  keys,
  value,
  onSelect,
  disabled,
}: KeySelectorProps) {
  const selectedKey = value ? keys.find((k) => k.id === value) : null
  const displayValue = selectedKey
    ? `${selectedKey.name} (${selectedKey.key_prefix})`
    : '全部 Keys'

  return (
    <Select.Root
      value={value ?? '__all__'}
      onValueChange={(v) => onSelect(v === '__all__' ? null : v)}
      disabled={disabled}
    >
      <Select.Trigger className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40 min-w-[160px]">
        <Select.Value>{displayValue}</Select.Value>
        <Select.Icon>
          <ChevronDown size={14} className="text-gray-400 ml-auto" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="z-50 min-w-[200px] overflow-hidden rounded-md border border-gray-200 bg-white shadow-md"
          position="popper"
          sideOffset={4}
        >
          <Select.Viewport className="p-1">
            <SelectItem value="__all__">全部 Keys</SelectItem>
            {keys.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.name}{' '}
                <span className="text-gray-400 text-xs">({k.key_prefix})</span>
              </SelectItem>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function SelectItem({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  return (
    <Select.Item
      value={value}
      className="relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-3 text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <Select.ItemIndicator className="absolute left-2 flex items-center">
        <Check size={12} className="text-gray-900" />
      </Select.ItemIndicator>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  )
}
