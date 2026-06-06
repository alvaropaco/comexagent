import { Shield, DollarSign, Truck } from 'lucide-react';
import { Roles } from '../../types/comex';
import { motion } from 'motion/react';

interface RolesPanelProps {
  roles: Roles;
}

export function RolesPanel({ roles }: RolesPanelProps) {
  if (!roles) return null;

  const roleConfigs = [
    {
      id: 'ops',
      label: 'Ops Tip',
      icon: Truck,
      color: 'blue',
      content: roles.ops,
    },
    {
      id: 'pricing',
      label: 'Pricing Tip',
      icon: DollarSign,
      color: 'green',
      content: roles.pricing,
    },
    {
      id: 'risk',
      label: 'Risk Tip',
      icon: Shield,
      color: 'red',
      content: roles.risk,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      {roleConfigs.map((role) => (
        <div
          key={role.id}
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2 relative overflow-hidden group"
        >
          <div className={`absolute top-0 left-0 w-1 h-full bg-${role.color}-500/50`} />
          <div className="flex items-center gap-2">
            <role.icon className={`w-4 h-4 text-${role.color}-400`} />
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {role.label}
            </span>
          </div>
          <div className="space-y-1">
            {role.content.split('\n').filter(b => b.trim()).map((bullet, idx) => (
              <p key={idx} className="text-xs text-zinc-400 leading-relaxed font-medium flex gap-2">
                <span className="text-zinc-600">•</span>
                {bullet.replace(/^- /, '')}
              </p>
            ))}
          </div>
        </div>
      ))}
    </motion.div>
  );
};
