import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Box } from '@chakra-ui/react';

interface TooltipState {
  isVisible: boolean;
  content: ReactNode | null;
  position: { x: number; y: number };
  anchor: 'top' | 'right' | 'bottom' | 'left';
}

interface TooltipContextValue {
  showTooltipFromEvent: (content: ReactNode, event: React.MouseEvent, anchor?: 'top' | 'right' | 'bottom' | 'left') => void;
  hideTooltip: () => void;
  tooltipState: TooltipState;
}

const TooltipContext = createContext<TooltipContextValue | undefined>(undefined);

interface TooltipProviderProps {
  children: ReactNode;
}

export const TooltipProvider: React.FC<TooltipProviderProps> = ({ children }) => {
  const [tooltipState, setTooltipState] = useState<TooltipState>({
    isVisible: false,
    content: null,
    position: { x: 0, y: 0 },
    anchor: 'top'
  });

  const showTooltipFromEvent = useCallback((
    content: ReactNode,
    event: React.MouseEvent,
    anchor: 'top' | 'right' | 'bottom' | 'left' = 'top'
  ) => {
    const x = event.clientX;
    const y = event.clientY;

    setTooltipState({
      isVisible: true,
      content,
      position: { x, y },
      anchor
    });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltipState(prev => ({
      ...prev,
      isVisible: false,
      content: null
    }));
  }, []);

  return (
    <TooltipContext.Provider value={{ showTooltipFromEvent, hideTooltip, tooltipState }}>
      {children}
      {tooltipState.isVisible && tooltipState.content && (
        <TooltipPortal
          content={tooltipState.content}
          position={tooltipState.position}
          anchor={tooltipState.anchor}
        />
      )}
    </TooltipContext.Provider>
  );
};

interface TooltipPortalProps {
  content: ReactNode;
  position: { x: number; y: number };
  anchor: 'top' | 'right' | 'bottom' | 'left';
}

const TooltipPortal: React.FC<TooltipPortalProps> = ({ content, position, anchor }) => {
  const getTooltipPosition = () => {
    const offset = 10;
    const tooltipWidth = 420; // Based on TooltipCard minW="420px"
    const tooltipHeight = 300; // Estimated height
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let finalAnchor = anchor;
    let x = position.x;
    let y = position.y;
    
    // Adjust anchor and position based on viewport boundaries
    switch (anchor) {
      case 'right':
        // Check if tooltip would go beyond right edge
        if (x + offset + tooltipWidth > viewportWidth) {
          finalAnchor = 'left';
        }
        // Check if tooltip would go beyond bottom edge
        if (y + tooltipHeight / 2 > viewportHeight) {
          y = viewportHeight - tooltipHeight / 2 - offset;
        }
        // Check if tooltip would go beyond top edge
        if (y - tooltipHeight / 2 < 0) {
          y = tooltipHeight / 2 + offset;
        }
        break;
        
      case 'left':
        // Check if tooltip would go beyond left edge
        if (x - offset - tooltipWidth < 0) {
          finalAnchor = 'right';
        }
        // Check vertical boundaries
        if (y + tooltipHeight / 2 > viewportHeight) {
          y = viewportHeight - tooltipHeight / 2 - offset;
        }
        if (y - tooltipHeight / 2 < 0) {
          y = tooltipHeight / 2 + offset;
        }
        break;
        
      case 'bottom':
        // Check if tooltip would go beyond bottom edge
        if (y + offset + tooltipHeight > viewportHeight) {
          finalAnchor = 'top';
        }
        // Check horizontal boundaries
        if (x + tooltipWidth / 2 > viewportWidth) {
          x = viewportWidth - tooltipWidth / 2 - offset;
        }
        if (x - tooltipWidth / 2 < 0) {
          x = tooltipWidth / 2 + offset;
        }
        break;
        
      case 'top':
      default:
        // Check if tooltip would go beyond top edge
        if (y - offset - tooltipHeight < 0) {
          finalAnchor = 'bottom';
        }
        // Check horizontal boundaries
        if (x + tooltipWidth / 2 > viewportWidth) {
          x = viewportWidth - tooltipWidth / 2 - offset;
        }
        if (x - tooltipWidth / 2 < 0) {
          x = tooltipWidth / 2 + offset;
        }
        break;
    }
    
    // Return position based on final anchor
    switch (finalAnchor) {
      case 'right':
        return {
          left: x + offset,
          top: y,
          transform: 'translateY(-50%)'
        };
      case 'left':
        return {
          left: x - offset - tooltipWidth,
          top: y,
          transform: 'translateY(-50%)'
        };
      case 'bottom':
        return {
          left: x,
          top: y + offset,
          transform: 'translateX(-50%)'
        };
      case 'top':
      default:
        return {
          left: x,
          top: y - offset - tooltipHeight,
          transform: 'translateX(-50%)'
        };
    }
  };

  return (
    <Box
      position="fixed"
      zIndex={9999}
      pointerEvents="none"
      style={getTooltipPosition()}
    >
      {content}
    </Box>
  );
};

export const useCustomTooltip = (): TooltipContextValue => {
  const context = useContext(TooltipContext);
  if (context === undefined) {
    throw new Error('useCustomTooltip must be used within a TooltipProvider');
  }
  return context;
};