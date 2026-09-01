"use client";

import { useState } from "react";
import type { TreeNode } from "@/server/project-service";
import { fa } from "./ui";

interface Props {
  tree: TreeNode[];
  selectedStatementId: number | null;
  onSelectStatement: (statementId: number, contractId: number) => void;
  onSelectProject: (projectId: number) => void;
  onMove: (projectId: number, parentId: number | null) => void;
}

const versionLabels: Record<string, string> = {
  contractor: "پیمانکار",
  consultant: "مشاور",
  employer: "کارفرما",
};

function NodeView({
  node,
  depth,
  props,
  dragging,
  setDragging,
}: {
  node: TreeNode;
  depth: number;
  props: Props;
  dragging: number | null;
  setDragging: (v: number | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const [hover, setHover] = useState(false);

  return (
    <li>
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          setDragging(node.id);
        }}
        onDragEnd={() => setDragging(null)}
        onDragOver={(e) => {
          if (dragging !== null && dragging !== node.id) {
            e.preventDefault();
            setHover(true);
          }
        }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setHover(false);
          if (dragging !== null && dragging !== node.id) {
            props.onMove(dragging, node.id);
          }
          setDragging(null);
        }}
        className={`group flex cursor-grab items-center gap-1 rounded-md px-2 py-1.5 text-xs transition ${
          hover ? "bg-emerald-100 ring-1 ring-emerald-400" : "hover:bg-slate-100"
        }`}
        style={{ marginRight: depth * 12 }}
        onClick={() => props.onSelectProject(node.id)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="w-4 text-slate-400"
        >
          {node.children.length || node.contracts.length ? (open ? "▾" : "▸") : "•"}
        </button>
        <span className="text-base leading-none">
          {node.nodeType === "parent" ? "🏢" : "📁"}
        </span>
        <span className="font-medium text-slate-800">{node.title}</span>
        <span className="text-[10px] text-slate-400">{fa(node.code)}</span>
      </div>

      {open ? (
        <>
          {node.contracts.map((c) => (
            <div key={c.id} style={{ marginRight: (depth + 1) * 12 }}>
              <div className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-600">
                <span>📄</span>
                <span className="font-medium">{c.title}</span>
                <span className="text-slate-400">({fa(c.contractNo)})</span>
              </div>
              <ul>
                {c.statements.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => props.onSelectStatement(s.id, c.id)}
                      className={`mr-6 flex w-[calc(100%-1.5rem)] items-center justify-between gap-2 rounded-md px-2 py-1 text-right text-[11px] ${
                        props.selectedStatementId === s.id
                          ? "bg-sky-600 text-white"
                          : "text-slate-600 hover:bg-sky-50"
                      }`}
                    >
                      <span>
                        🧾 {s.title}
                      </span>
                      <span className="text-[10px] opacity-80">
                        {versionLabels[s.version] ?? s.version}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {node.children.length ? (
            <ul>
              {node.children.map((child) => (
                <NodeView
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  props={props}
                  dragging={dragging}
                  setDragging={setDragging}
                />
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export default function ProjectTree(props: Props) {
  const [dragging, setDragging] = useState<number | null>(null);

  return (
    <div
      onDragOver={(e) => {
        if (dragging !== null) e.preventDefault();
      }}
      onDrop={() => {
        if (dragging !== null) props.onMove(dragging, null);
        setDragging(null);
      }}
      className="min-h-[200px]"
    >
      <ul>
        {props.tree.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            depth={0}
            props={props}
            dragging={dragging}
            setDragging={setDragging}
          />
        ))}
      </ul>
      <p className="mt-3 rounded-md bg-slate-50 p-2 text-[10px] leading-5 text-slate-500">
        برای تغییر ساختار درخت، پروژه را بکشید و روی پروژه مادر مقصد رها کنید.
        رها کردن در فضای خالی، پروژه را به سطح ریشه منتقل می‌کند.
      </p>
    </div>
  );
}
