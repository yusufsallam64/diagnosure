import React from 'react'

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
   return (
     <div className={`bg-background-800 rounded-lg ${className}`}>
       {children}
     </div>
   );
 };

export default Card;