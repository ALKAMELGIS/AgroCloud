import * as React from 'react'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

export type ModalProps = {
  isOpen: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
  actions?: React.ReactNode
}

export function Modal({ isOpen, title, onClose, children, actions }: ModalProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="agro-shared-modal-title">
      <DialogTitle id="agro-shared-modal-title" sx={{ pr: 6 }}>
        {title}
        <IconButton
          aria-label="Close dialog"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>{children}</DialogContent>
      {actions ? <DialogActions>{actions}</DialogActions> : null}
    </Dialog>
  )
}
