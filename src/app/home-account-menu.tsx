"use client";

import { LogOut, Moon, Sun } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/overlays";
import { logout } from "@/server/actions/auth";
import { setThemeAction } from "@/server/actions/worlds";

export function HomeAccountMenu({ name, email }: { name: string; email: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold hover:ring-2 hover:ring-line-strong" aria-label="Account">
          {name.slice(0, 1).toUpperCase()}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block font-medium text-fg">{name}</span>
          <span className="block truncate">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            const dark = document.documentElement.classList.contains("dark");
            await setThemeAction(dark ? "light" : "dark");
            document.documentElement.classList.toggle("dark", !dark);
          }}
        >
          <Moon className="dark:hidden" />
          <Sun className="hidden dark:block" />
          Toggle theme
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
