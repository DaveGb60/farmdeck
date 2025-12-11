import { Leaf, Menu, Trash2, Sun, Moon, Home, Phone, Mail, Heart, Banknote, Copy, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useTheme } from '@/hooks/useTheme';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from 'sonner';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: 'Projects', path: '/', icon: Home },
    { label: 'Trash', path: '/trash', icon: Trash2 },
  ];

  const ContactInfo = () => (
    <div className="space-y-3">
      <h4 className="font-medium text-sm text-foreground">Contact</h4>
      <div className="space-y-2 text-sm">
        <a href="tel:0768974474" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <Phone className="h-4 w-4" />
          0768974474
        </a>
        <a href="https://wa.me/254768974474" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-muted-foreground hover:text-green-600 transition-colors">
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
        <a href="mailto:gfibionjoseph@gmail.com" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <Mail className="h-4 w-4" />
          gfibionjoseph@gmail.com
        </a>
      </div>
    </div>
  );

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const DonateInfo = () => (
    <div className="space-y-3">
      <h4 className="font-medium text-sm text-foreground">Donate / Support</h4>
      <div className="space-y-3 text-sm text-muted-foreground">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Banknote className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">M-Pesa Till</p>
              <p>3663466</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => copyToClipboard('3663466', 'M-Pesa Till')}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Banknote className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground">Bank</p>
              <p>Till: 522522</p>
              <p>A/C: 1318792959</p>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => copyToClipboard('522522', 'Bank Till')}
              title="Copy Till"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => copyToClipboard('1318792959', 'Account Number')}
              title="Copy A/C"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div 
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-hero shadow-soft cursor-pointer"
            onClick={() => navigate('/')}
          >
            <Leaf className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="cursor-pointer" onClick={() => navigate('/')}>
            <h1 className="font-serif text-xl font-semibold text-foreground">FarmDeck</h1>
            <p className="text-xs text-muted-foreground">Offline Farm Records</p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              onClick={() => navigate(item.path)}
              className={cn(
                "gap-2",
                location.pathname === item.path && "bg-muted text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Button>
          ))}
          <div className="w-px h-6 bg-border mx-2" />
          
          {/* Contact Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Phone className="h-4 w-4" />
                Contact
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <ContactInfo />
            </PopoverContent>
          </Popover>

          {/* Donate Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Heart className="h-4 w-4" />
                Support
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <DonateInfo />
            </PopoverContent>
          </Popover>

          <div className="w-px h-6 bg-border mx-2" />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9"
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </Button>
        </nav>
        
        {/* Mobile Navigation */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <nav className="flex flex-col gap-2 mt-8">
              {navItems.map((item) => (
                <Button
                  key={item.path}
                  variant={location.pathname === item.path ? "secondary" : "ghost"}
                  className="justify-start gap-3"
                  onClick={() => navigate(item.path)}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Button>
              ))}
              
              <div className="h-px bg-border my-4" />
              
              {/* Contact Section */}
              <div className="px-3">
                <ContactInfo />
              </div>
              
              <div className="h-px bg-border my-4" />
              
              {/* Donate Section */}
              <div className="px-3">
                <DonateInfo />
              </div>
              
              <div className="h-px bg-border my-4" />
              <div className="flex items-center justify-between px-3">
                <span className="text-sm text-muted-foreground">Theme</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleTheme}
                  className="gap-2"
                >
                  {theme === 'light' ? (
                    <>
                      <Moon className="h-4 w-4" />
                      Dark
                    </>
                  ) : (
                    <>
                      <Sun className="h-4 w-4" />
                      Light
                    </>
                  )}
                </Button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}