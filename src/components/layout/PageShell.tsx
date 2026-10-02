import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Footer } from "./Footer";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageShell({ children, className, contentClassName }: PageShellProps) {
  return (
    <div className={cn("page-shell flex min-h-screen flex-col", className)}>
      <div className={cn("relative z-10 flex-1", contentClassName)}>{children}</div>
      <Footer />
    </div>
  );
}
