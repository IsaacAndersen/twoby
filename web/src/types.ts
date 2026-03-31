export interface Item {
  id: string
  label: string
  image_url?: string
  r_x?: number
  r_y?: number
  x_mu?: number
  y_mu?: number
}

export interface ChartData {
  title: string
  mode: string
  x_label?: string
  y_label?: string
  description?: string
  creator_take?: string
  voting_active?: boolean
  ends_at?: string
  is_voting_paused?: boolean
  items: Item[]
}

export interface ItemData {
  label: string
  image_url?: string
}
