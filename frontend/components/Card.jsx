import { Box, HStack, Spinner } from "@chakra-ui/react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { disabledPages } from "../lib/config";
import { usePrefetch } from "../hooks/usePrefetch";

export default function Card({
  children,
  rightContent,
  href = "",
  style,
  isSummary,
  isExternal = false,
  onClick = () => {},
  isStatic = false,
  spinnerTop = 4,
  enablePrefetch = true,
  ...props
}) {
  // eslint-disable-next-line no-param-reassign
  if (disabledPages.includes(href)) href = "";
  const router = useRouter();
  const [clicked, setClicked] = useState(false);
  const timeoutRef = useRef(null);
  const cardRef = useRef(null);
  const extraStyles = style || {};
  
  const { prefetchDetail, cleanup } = usePrefetch();

  // Intersection observer for prefetching visible cards
  useEffect(() => {
    if (!enablePrefetch || !href || isStatic || isExternal || !cardRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            prefetchDetail(href);
          }
        });
      },
      {
        rootMargin: '100px', // Start prefetching when card is 100px from viewport
        threshold: 0.1,
      }
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
    };
  }, [enablePrefetch, href, isStatic, isExternal, prefetchDetail]);

  // Router event handling for spinner state
  useEffect(() => {
    const handleRouteChangeStart = () => {
      // Spinner is already managed by click handlers
    };

    const handleRouteChangeComplete = () => {
      setClicked(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const handleRouteChangeError = () => {
      setClicked(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setClicked(false);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);
    router.events.on('routeChangeError', handleRouteChangeError);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
      router.events.off('routeChangeError', handleRouteChangeError);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      cleanup();
    };
  }, [router.events, cleanup]);

  // Detect new-tab/external navigation intent
  const isNewTabClick = (e) => {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1;
  };

  const handleClick = (e) => {
    if (href && !isStatic && !isExternal) {
      // Only show spinner for same-tab navigation
      if (!isNewTabClick(e)) {
        setClicked(true);
        // Fallback timeout to clear spinner if no route event arrives
        timeoutRef.current = setTimeout(() => {
          setClicked(false);
        }, 3000);
      }
    } else if (isStatic) {
      const path = router.asPath.split("?")[0];
      window.parent.postMessage(
        { url: `https://buzzgrades.org${path}?ref=ext` },
        "*"
      );
    }
    onClick(e);
  };

  const handleAuxClick = (e) => {
    // Handle middle-click (button === 1)
    if (e.button === 1 && href && !isStatic && !isExternal) {
      // Don't show spinner for middle-click (opens in new tab)
      onClick(e);
    }
  };

  const handleMouseEnter = () => {
    if (enablePrefetch && href && !isStatic && !isExternal) {
      prefetchDetail(href);
    }
  };
  const hoverStyles = href
    ? {
        cursor: "pointer",
        boxShadow: "0px 0px 4px rgba(0, 48, 87, 0.2)",
        background: "rgba(255,255,255,0.25)",
        transition: "opacity 0.1s",
      }
    : {};

  const summaryStyles = isSummary
    ? {
        background: "rgba(255,255,255,0.85)",
        boxShadow: "0px 0px 6px rgba(0, 48, 87, 0.175)",
        padding: "36px 20px",
      }
    : {};
  const staticStyles = isStatic
    ? {
        padding: 0,
        margin: 0,
        boxShadow: "none",
      }
    : {};
  const card = (
    <Box
      ref={cardRef}
      background={"rgba(255,255,255,0.35)"}
      boxShadow={"0px 0px 4px rgba(0, 48, 87, 0.1)"}
      as={href ? "button" : "div"}
      style={{
        borderRadius: 8,
        width: "100%",
        padding: "12px 20px",
        position: "relative",
        textAlign: "left",
        ...summaryStyles,
        ...extraStyles,
        ...staticStyles,
      }}
      _hover={hoverStyles}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onMouseEnter={handleMouseEnter}
      {...props}
    >
      {rightContent ? (
        <HStack justify="space-between" align="center" width="100%">
          <Box flex="1" minWidth="0">
            {children}
          </Box>
          <HStack spacing={2} flexShrink={0}>
            {rightContent}
          </HStack>
        </HStack>
      ) : (
        children
      )}
      {clicked && !isExternal && (
        <Spinner 
          size={"sm"} 
          ml={2} 
          position={"absolute"} 
          left={-1.5} 
          top={typeof spinnerTop === 'string' ? `${parseInt(spinnerTop) - 18.5}px` : `${spinnerTop - 18.5}px`} 
        />
      )}
    </Box>
  );

  if (href && !isStatic) {
    const extraProps = isExternal ? { target: "_blank" } : {};
    return (
      <Link
        href={href}
        prefetch={false} // We handle prefetching manually
        style={{
          width: "100%",
        }}
        {...extraProps}
      >
        {card}
      </Link>
    );
  }
  return card;
}
