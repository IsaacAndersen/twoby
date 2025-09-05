
interface ItemsEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function ItemsEditor({ value, onChange, placeholder }: ItemsEditorProps) {
  // Just use a simple textarea - clean and predictable
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Enter items, one per line...\n\nExample:\nSpotify\nApple Music\nYouTube Music"}
        className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
        required
      />
      {value && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {value.split('\n').filter(line => line.trim()).length} items
          </span>
          <span className="text-gray-400">
            Tip: Add image URLs after item names to include pictures
          </span>
        </div>
      )}
    </div>
  )
}