import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

export const mdxComponents = {
  a: (props: ComponentPropsWithoutRef<"a">) => {
    const href = props.href ?? "";
    if (href.startsWith("/") && !href.startsWith("//")) {
      return <Link href={href}>{props.children}</Link>;
    }
    return (
      <a {...props} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
        {props.children}
      </a>
    );
  },
};
