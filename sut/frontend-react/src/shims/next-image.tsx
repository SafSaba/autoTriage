import React from 'react';

export interface NextImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
}

const Image = React.forwardRef<HTMLImageElement, NextImageProps>(
  ({ src, alt, fill, priority, className = '', style, ...props }, ref) => {
    const fillStyle: React.CSSProperties = fill
      ? { position: 'absolute', height: '100%', width: '100%', inset: 0, ...style }
      : style || {};
    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        className={className}
        style={fillStyle}
        {...props}
      />
    );
  }
);
Image.displayName = 'Image';

export default Image;
