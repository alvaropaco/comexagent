import { CheckCircle, AlertCircle, Info } from 'lucide-react';
import { Operation } from '../../types/comex';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';

interface OperationEnvelopeProps {
  operation: Operation;
}

export function OperationEnvelope({ operation }: OperationEnvelopeProps) {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (operation.status === 'success') {
    const isSale = operation.action_type === 'CREATE_SALE';
    const isBuy = operation.action_type === 'CREATE_BUY_ORDER';
    const data = operation.created;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 space-y-4"
      >
        <div className="flex items-start gap-3 p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-xl text-emerald-100">
          <CheckCircle className="w-6 h-6 flex-shrink-0 text-emerald-400 mt-0.5" />
          <div className="flex flex-col gap-2">
            <span className="text-base font-bold text-white">
              {isSale ? "✅ Done! Your sale offer is live." : isBuy ? "✅ Done! Your buy order is live." : operation.message}
            </span>
            
            {isSale && data && (
              <p className="text-sm text-emerald-200/80 leading-relaxed">
                You’re offering <span className="text-white font-medium">{data.volume}</span> of <span className="text-white font-medium">{data.commodity}</span> ({data.incoterm} {data.origin}) at <span className="text-white font-medium">${data.price?.toLocaleString()} {data.currency || 'USD'}</span> per container, shipping to <span className="text-white font-medium">{data.destination}</span>.
              </p>
            )}

            {isBuy && data && (
              <p className="text-sm text-emerald-200/80 leading-relaxed">
                You’re looking for <span className="text-white font-medium">{data.volume}</span> of <span className="text-white font-medium">{data.commodity}</span>, target price <span className="text-white font-medium">${(data.targetPrice || data.price)?.toLocaleString()} {data.currency || 'USD'}</span> per container, delivery to <span className="text-white font-medium">{data.destination}</span>.
              </p>
            )}

            {data?._id && (
              <span className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-widest mt-1">
                Reference ID: {data._id}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (operation.status === 'needs_input') {
    const filteredMissing = (operation.missing_fields || []).filter(f => f !== 'out_of_scope');
    const isOutOfScope = (operation.missing_fields || []).includes('out_of_scope');

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 space-y-3"
      >
        <div className={cn(
          "flex items-center gap-2 p-3 border rounded-lg",
          isOutOfScope ? "bg-red-900/20 border-red-500/30 text-red-400" : "bg-brand-accent/10 border-brand-accent/30 text-brand-accent"
        )}>
          {isOutOfScope ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> : <Info className="w-5 h-5 flex-shrink-0 text-brand-accent" />}
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {isOutOfScope ? "I'm sorry, but this request is out of scope for the Comex Agent." : operation.message}
            </span>
            {!isOutOfScope && filteredMissing.length > 0 && (
              <span className="text-xs opacity-80 mt-1">
                Required information: {filteredMissing.join(', ')}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  if (operation.status === 'error') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4"
      >
        <div className="flex items-center gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-bold">Prompt Not Allowed</span>
            <span className="text-xs opacity-80">
              I'm sorry, but this prompt is not allowed. Please note that only Comex Agent-related prompts are supported by this assistant.
            </span>
          </div>
        </div>
      </motion.div>
    );
  }

  return null;
};
