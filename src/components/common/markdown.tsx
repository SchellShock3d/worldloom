"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitDmBlocks } from "@/lib/mentions";
import { getEntityType } from "@/lib/entity-types";
import { TONE_VAR } from "@/components/entity/type-icon";
import { cn } from "@/lib/utils";
import { useOptionalWorld } from "@/components/shell/world-context";

export type RefMap = Record<string, { name: string; type: string; summary?: string }>;

const TOKEN = /@\[([^\]\n]{1,200})\]\(entity:([0-9a-f-]{36})\)/gi;

function preprocess(md: string) {
  // Mentions become links with an entity: URL that the custom <a> renders as a chip.
  return md.replace(TOKEN, (_m, name: string, id: string) => `[${name.replace(/[[\]]/g, "")}](entity:${id})`);
}

const urlTransform = (url: string) => (url.startsWith("entity:") ? url : defaultUrlTransform(url));

export function Markdown({
  children,
  refs,
  className,
  playerView = false,
  variant = "lore",
  worldId,
  linkBase,
  newTab = false,
}: {
  children: string;
  refs?: RefMap;
  className?: string;
  /** Hide DM-only blocks entirely. */
  playerView?: boolean;
  variant?: "lore" | "compact" | "sans";
  worldId?: string;
  /** Where @mention links point (defaults to the DM wiki: /w/:world/e). */
  linkBase?: string;
  /** Open entity links in a new tab (Run Session keeps its screen, notes and music). */
  newTab?: boolean;
}) {
  const w = useOptionalWorld();
  const wid = worldId ?? w?.worldId;
  const segments = React.useMemo(() => splitDmBlocks(children ?? ""), [children]);
  const components = React.useMemo(
    () => ({
      a: ({ href, children: kids }: { href?: string; children?: React.ReactNode }) => {
        if (href?.startsWith("entity:")) {
          const id = href.slice(7);
          const ref = refs?.[id];
          const tone = ref ? TONE_VAR[getEntityType(ref.type).tone] : undefined;
          // In the player view an unknown mention is just text: players shouldn't learn that a page exists.
          if (refs && !ref) return playerView ? <span>{kids}</span> : <span className="mention mention--missing" title="This entity no longer exists">{kids}</span>;
          return (
            <Link href={linkBase ? `${linkBase}/${id}` : wid ? `/w/${wid}/e/${id}` : "#"} {...(newTab ? { target: "_blank", rel: "noopener" } : {})} className="mention" style={tone ? ({ "--mention-color": tone } as React.CSSProperties) : undefined} title={ref?.summary || undefined}>
              {ref?.name ?? kids}
            </Link>
          );
        }
        const external = href && /^https?:/.test(href);
        return (
          <a href={href} {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}>
            {kids}
          </a>
        );
      },
    }),
    [refs, wid, linkBase, playerView, newTab],
  );
  const cls = cn("lore", variant === "compact" && "lore--compact", variant === "sans" && "lore--sans", className);
  if (!segments.length) return null;
  return (
    <div className={cls}>
      {segments.map((seg, i) =>
        seg.kind === "dm" ? (
          playerView ? null : (
            <div key={i} className="dm-block">
              <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
                {preprocess(seg.text)}
              </ReactMarkdown>
            </div>
          )
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
            {preprocess(seg.text)}
          </ReactMarkdown>
        ),
      )}
    </div>
  );
}
