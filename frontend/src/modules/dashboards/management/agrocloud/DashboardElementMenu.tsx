type DashboardElementMenuProps = {
  elementId: string
  onConfigure: () => void
  onDuplicate: () => void
  onDelete: () => void
  onBeginLayoutDrag?: (elementId: string, clientX: number, clientY: number, shiftKey: boolean) => void
  onBeginResize?: (elementId: string, clientX: number, clientY: number, pointerId?: number) => void
}

export function DashboardElementMenu({
  elementId,
  onConfigure,
  onDuplicate,
  onDelete,
  onBeginLayoutDrag,
  onBeginResize,
}: DashboardElementMenuProps) {
  return (
    <div
      className="agrocloud-dashboard-element-menu"
      role="toolbar"
      aria-label="Element options"
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        className="agrocloud-dashboard-element-menu__btn agrocloud-dashboard-element-menu__btn--drag"
        aria-label="Drag item"
        title="Drag item (hold Shift for precision snap)"
        onPointerDown={e => {
          if (e.button !== 0 || !onBeginLayoutDrag) return
          e.preventDefault()
          e.stopPropagation()
          onBeginLayoutDrag(elementId, e.clientX, e.clientY, e.shiftKey)
        }}
      >
        <i className="fa-solid fa-up-down-left-right" aria-hidden />
      </button>
      {onBeginResize ? (
        <button
          type="button"
          className="agrocloud-dashboard-element-menu__btn agrocloud-dashboard-element-menu__btn--resize"
          aria-label="Resize card"
          title="Resize card"
          onPointerDown={e => {
            if (e.button !== 0) return
            e.preventDefault()
            e.stopPropagation()
            onBeginResize(elementId, e.clientX, e.clientY, e.pointerId)
          }}
        >
          <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        className="agrocloud-dashboard-element-menu__btn"
        aria-label="Configure element"
        title="Configure element"
        onClick={onConfigure}
      >
        <i className="fa-solid fa-gear" aria-hidden />
      </button>
      <button
        type="button"
        className="agrocloud-dashboard-element-menu__btn"
        aria-label="Duplicate element"
        title="Duplicate element"
        onClick={onDuplicate}
      >
        <i className="fa-regular fa-clone" aria-hidden />
      </button>
      <button
        type="button"
        className="agrocloud-dashboard-element-menu__btn agrocloud-dashboard-element-menu__btn--danger"
        aria-label="Delete element"
        title="Delete element"
        onClick={onDelete}
      >
        <i className="fa-solid fa-trash-can" aria-hidden />
      </button>
    </div>
  )
}
