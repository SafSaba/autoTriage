import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

export interface NextLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: React.ReactNode;
}

const Link = React.forwardRef<HTMLAnchorElement, NextLinkProps>(
  ({ href, children, ...props }, ref) => {
    if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
      return (
        <a ref={ref} href={href} {...props}>
          {children}
        </a>
      );
    }
    return (
      <RouterLink ref={ref} to={href} {...props}>
        {children}
      </RouterLink>
    );
  }
);
Link.displayName = 'Link';

export default Link;
