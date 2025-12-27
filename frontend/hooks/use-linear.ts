import { useQuery } from '@tanstack/react-query'

interface LinearTicketInfo {
  id: string
  identifier: string
  title: string
  status: string
  url: string
}

export function useLinearTicket(ticketId: string | null) {
  return useQuery({
    queryKey: ['linear-ticket', ticketId],
    queryFn: async (): Promise<LinearTicketInfo | null> => {
      if (!ticketId) return null
      const res = await fetch(`/api/linear/ticket/${ticketId}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!ticketId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  })
}
