import { useState } from 'react'
import { Plus, Search, Star, Trash2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import type { ChatSession } from './types'

interface SessionSidebarProps {
  sessions: ChatSession[]
  selectedSession: ChatSession | null
  onSelectSession: (session: ChatSession) => void
  onCreateSession: () => void
  onDeleteSession: (id: string) => void
  onFavoriteSession: (id: string, favorite: boolean) => void
}

export function SessionSidebar({
  sessions,
  selectedSession,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onFavoriteSession,
}: SessionSidebarProps) {
  const [search, setSearch] = useState('')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  const filteredSessions = sessions.filter((session) => {
    if (showFavoritesOnly && !session.isFavorite) return false
    if (search && !session.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="w-52 flex-shrink-0 h-full flex flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-sidebar-foreground">Chats</h2>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onCreateSession}
            title="New chat"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-6 pl-7 text-xs bg-sidebar-accent/30"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-1 mt-2">
          <Button
            size="xs"
            variant={showFavoritesOnly ? 'secondary' : 'ghost'}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className="gap-1"
          >
            <Star className={cn('size-2.5', showFavoritesOnly && 'fill-current')} />
            Favorites
          </Button>
        </div>
      </div>

      {/* Session List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredSessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {search ? 'No matching chats' : 'No chats yet'}
            </div>
          ) : (
            filteredSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isSelected={selectedSession?.id === session.id}
                onSelect={() => onSelectSession(session)}
                onDelete={() => onDeleteSession(session.id)}
                onFavorite={(favorite) => onFavoriteSession(session.id, favorite)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface SessionItemProps {
  session: ChatSession
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onFavorite: (favorite: boolean) => void
}

function SessionItem({ session, isSelected, onSelect, onDelete, onFavorite }: SessionItemProps) {
  const [isHovered, setIsHovered] = useState(false)

  const timeAgo = session.lastMessageAt
    ? formatDistanceToNow(new Date(session.lastMessageAt), { addSuffix: true })
    : formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors',
        isSelected
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
      )}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <MessageSquare className="size-3.5 flex-shrink-0 text-muted-foreground" />

      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{session.title}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {session.messageCount} messages · {timeAgo}
        </div>
      </div>

      {/* Actions */}
      <div
        className={cn(
          'flex items-center gap-0.5 transition-opacity',
          isHovered || session.isFavorite ? 'opacity-100' : 'opacity-0'
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onFavorite(!session.isFavorite)
          }}
          className="p-1 rounded hover:bg-sidebar-accent"
          title={session.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            className={cn(
              'size-3',
              session.isFavorite ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'
            )}
          />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Delete chat"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  )
}
