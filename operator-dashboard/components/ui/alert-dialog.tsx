'use client';

import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;
const AlertDialogOverlay = AlertDialogPrimitive.Overlay;
const AlertDialogContent = AlertDialogPrimitive.Content;
const AlertDialogAction = AlertDialogPrimitive.Action;
const AlertDialogCancel = AlertDialogPrimitive.Cancel;
const AlertDialogTitle = AlertDialogPrimitive.Title;
const AlertDialogDescription = AlertDialogPrimitive.Description;

const StyledOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogOverlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogOverlay>
>(({ className, ...props }, ref) => (
  <AlertDialogOverlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/50 backdrop-blur-sm', className)}
    {...props}
  />
));
StyledOverlay.displayName = 'StyledOverlay';

const StyledContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogContent>,
  React.ComponentPropsWithoutRef<typeof AlertDialogContent>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <StyledOverlay />
    <AlertDialogContent
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-6 shadow-xl',
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
));
StyledContent.displayName = 'StyledContent';

const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-2 text-left', className)} {...props} />
);

const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
);

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  StyledContent as AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  StyledOverlay as AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
