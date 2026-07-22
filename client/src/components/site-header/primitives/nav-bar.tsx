import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { HUGO_REPO_URL } from "../../../utils/constants";

export function NavBar({
  menu,
  onClick,
  itemClassName = "",
}: {
  menu: boolean;
  onClick?: () => void;
  itemClassName?: string;
}) {
  const [location] = useLocation();
  const { t } = useTranslation();

  return (
    <>
      <NavItem menu={menu} onClick={onClick} itemClassName={itemClassName} title={t("article.title")} selected={location === "/" || location.startsWith("/feed")} href="/" />
      <NavItem menu={menu} onClick={onClick} itemClassName={itemClassName} title={t("timeline")} selected={location === "/timeline"} href="/timeline" />
      <NavItem menu={menu} onClick={onClick} itemClassName={itemClassName} title={t("moments.title")} selected={location === "/moments"} href="/moments" />
      <NavItem menu={menu} onClick={onClick} itemClassName={itemClassName} title={t("hashtags")} selected={location === "/hashtags"} href="/hashtags" />
      <NavItem menu={menu} onClick={onClick} itemClassName={itemClassName} title={t("friends.title")} selected={location === "/friends"} href="/friends" />
      <NavItem menu={menu} onClick={onClick} itemClassName={itemClassName} title={t("game.title")} selected={location === "/game" || location.startsWith("/game")} href="/game" />
      <NavItem menu={menu} onClick={onClick} itemClassName={itemClassName} title={t("about.title")} selected={location === "/about"} href="/about" />
      <NavItemExternal menu={menu} itemClassName={itemClassName} title={t("hugo")} href={HUGO_REPO_URL} onClick={onClick} />
    </>
  );
}

function NavItem({
  menu,
  title,
  selected,
  href,
  when = true,
  onClick,
  itemClassName = "",
}: {
  title: string;
  selected: boolean;
  href: string;
  menu?: boolean;
  when?: boolean;
  onClick?: () => void;
  itemClassName?: string;
}) {
  return when ? (
    <Link
      href={href}
      className={`${menu ? "" : "hidden"} md:block cursor-pointer hover:text-theme duration-300 px-2 py-4 md:p-4 text-sm ${
        selected ? "text-theme" : "dark:text-white"
      } ${itemClassName}`}
      state={{ animate: true }}
      onClick={onClick}
    >
      {title}
    </Link>
  ) : null;
}

function NavItemExternal({
  menu,
  title,
  href,
  onClick,
  itemClassName = "",
}: {
  title: string;
  href: string;
  menu?: boolean;
  onClick?: () => void;
  itemClassName?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className={`${menu ? "" : "hidden"} md:block cursor-pointer hover:text-theme duration-300 px-2 py-4 md:p-4 text-sm dark:text-white ${itemClassName}`}
    >
      {title} <i className="ri-external-link-line text-xs align-middle" />
    </a>
  );
}
