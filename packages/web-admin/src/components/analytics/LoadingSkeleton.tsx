interface LoadingSkeletonProps {
  variant?: 'cards' | 'chart' | 'table'
}

function SkeletonBox({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-100 ${className ?? ''}`}
    />
  )
}

export default function LoadingSkeleton({
  variant = 'chart',
}: LoadingSkeletonProps) {
  if (variant === 'cards') {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white px-5 py-4"
          >
            <SkeletonBox className="h-4 w-24 mb-3" />
            <SkeletonBox className="h-7 w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <SkeletonBox className="h-4 w-40" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-50 last:border-0">
            <SkeletonBox className="h-4 w-40" />
            <SkeletonBox className="h-4 w-20 ml-auto" />
            <SkeletonBox className="h-4 w-16" />
            <SkeletonBox className="h-4 w-20" />
          </div>
        ))}
      </div>
    )
  }

  // chart (default)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <SkeletonBox className="h-4 w-32 mb-4" />
      <SkeletonBox className="h-52 w-full" />
    </div>
  )
}
