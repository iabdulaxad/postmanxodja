import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, Check } from "lucide-react"
import confetti from "canvas-confetti"

interface SaveButtonProps {
  text?: {
    idle?: string
    saving?: string
    saved?: string
  }
  className?: string
  onSave?: () => Promise<void> | void
}

export function SaveButton({
  text = {
    idle: "Save",
    saving: "Saving...",
    saved: "Saved!"
  },
  className,
  onSave
}: SaveButtonProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle")

  const handleSave = async () => {
    if (status !== "idle") return
    setStatus("saving")
    try {
      if (onSave) {
        await onSave()
      }
      setStatus("saved")
      confetti({
        particleCount: 60,
        spread: 55,
        origin: { y: 0.7 },
        colors: ["#2563eb", "#3b82f6", "#06b6d4", "#60a5fa", "#93c5fd"],
        shapes: ["circle"],
      })
      setTimeout(() => {
        setStatus("idle")
      }, 1500)
    } catch (error) {
      setStatus("idle")
      console.error("Save failed:", error)
    }
  }

  return (
    <motion.button
      onClick={handleSave}
      disabled={status === "saving"}
      animate={
        status === "saved"
          ? { scale: [1, 1.08, 1] }
          : { scale: 1 }
      }
      transition={{ duration: 0.25 }}
      whileTap={status === "idle" ? { scale: 0.95 } : {}}
      className={[
        "px-3 md:px-4 py-2 rounded-lg shadow-sm font-medium text-sm transition-colors duration-150 flex items-center gap-1.5",
        status === "idle"
          ? "bg-primary hover:bg-primary/90 text-primary-foreground"
          : status === "saving"
            ? "bg-primary/80 text-primary-foreground cursor-not-allowed"
            : "bg-primary text-primary-foreground",
        className,
      ].filter(Boolean).join(" ")}
    >
      <AnimatePresence mode="wait">
        {status === "saving" && (
          <motion.span
            key="saving"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, rotate: 360 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{
              duration: 0.2,
              rotate: { repeat: Infinity, duration: 0.8, ease: "linear" },
            }}
          >
            <Loader2 className="w-3.5 h-3.5" />
          </motion.span>
        )}
        {status === "saved" && (
          <motion.span
            key="saved"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 15 }}
          >
            <Check className="w-3.5 h-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
      <motion.span
        key={status}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        {status === "idle" ? text.idle : status === "saving" ? text.saving : text.saved}
      </motion.span>
    </motion.button>
  )
}
