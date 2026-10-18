import type { ComponentProps, JSXElementConstructor } from "react";

// oxlint-disable-next-line no-explicit-any -- the constraint ComponentProps itself uses.
type AnyComponent = JSXElementConstructor<any>;

/**
 * A Base UI part's props with `className` narrowed to a string. Base UI also accepts a
 * function of state; our wrappers style with data attributes instead and merge with `cn`.
 */
export type Styled<T extends AnyComponent> = Omit<ComponentProps<T>, "className"> & { className?: string };
