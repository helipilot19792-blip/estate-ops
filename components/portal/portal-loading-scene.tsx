"use client";

type PortalLoadingSceneProps = {
  eyebrow?: string;
  title: string;
  body: string;
  badge?: string;
};

export default function PortalLoadingScene({
  eyebrow = "Portal workspace",
  title,
  body,
  badge = "Loading",
}: PortalLoadingSceneProps) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-[#d8e8d2] bg-[linear-gradient(180deg,#f6fbf2_0%,#eef8e8_45%,#e5f1de_100%)] p-5 shadow-[0_24px_60px_rgba(46,125,50,0.10)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4f7a47]">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#18351a] sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#456047] sm:text-base">
            {body}
          </p>
        </div>

        <span className="w-fit rounded-full border border-[#bfd8b8] bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#35663a] shadow-sm">
          {badge}
        </span>
      </div>

      <div className="mt-6 rounded-[28px] border border-[#cfe2c8] bg-[linear-gradient(180deg,#eaf6e4_0%,#d9edcf_100%)] px-4 py-5 sm:px-6">
        <div className="relative h-[210px] overflow-hidden rounded-[22px] border border-[#c6ddb9] bg-[linear-gradient(180deg,#eaf7ff_0%,#f6fcff_42%,#dff0d8_42%,#cfe6c1_100%)]">
          <div className="absolute left-5 top-5 h-9 w-9 rounded-full bg-white/90 shadow-sm" />
          <div className="absolute right-16 top-8 h-4 w-14 rounded-full bg-white/80" />
          <div className="absolute right-8 top-12 h-5 w-20 rounded-full bg-white/70" />

          <div className="absolute inset-x-0 bottom-0 h-[92px] bg-[repeating-linear-gradient(90deg,#9bcb7f_0_18px,#8fc26f_18px_36px)]" />
          <div className="absolute inset-x-0 bottom-[68px] h-[30px] bg-[repeating-linear-gradient(90deg,#bfe1a6_0_14px,#cbe7b4_14px_28px)] opacity-80" />

          <div className="portal-loader-track absolute bottom-[54px] left-[-120px]">
            <div className="relative h-[120px] w-[220px]">
              <div className="absolute bottom-[26px] left-[84px] h-[42px] w-[58px] rounded-[14px_18px_12px_12px] bg-[#4d7f39] shadow-[inset_0_-6px_0_rgba(0,0,0,0.08)]" />
              <div className="absolute bottom-[54px] left-[102px] h-[26px] w-[12px] rounded-full bg-[#2f4d24]" />
              <div className="absolute bottom-[74px] left-[92px] h-[20px] w-[34px] rounded-[16px_16px_10px_10px] bg-[#f5c77f]" />
              <div className="absolute bottom-[86px] left-[104px] h-[20px] w-[12px] rounded-full bg-[#5f432d]" />
              <div className="absolute bottom-[68px] left-[78px] h-[18px] w-[12px] rounded-full bg-[#d6945f]" />
              <div className="absolute bottom-[68px] left-[128px] h-[18px] w-[12px] rounded-full bg-[#d6945f]" />
              <div className="absolute bottom-[48px] left-[84px] h-[28px] w-[12px] origin-top rounded-full bg-[#355429]" />
              <div className="absolute bottom-[48px] left-[124px] h-[28px] w-[12px] origin-top rounded-full bg-[#355429]" />
              <div className="absolute bottom-[28px] left-[82px] h-[26px] w-[16px] rounded-full bg-[#23371c]" />
              <div className="absolute bottom-[28px] left-[122px] h-[26px] w-[16px] rounded-full bg-[#23371c]" />

              <div className="absolute bottom-[52px] left-[124px] h-[6px] w-[56px] origin-left rounded-full bg-[#2d4c23] rotate-[18deg]" />
              <div className="absolute bottom-[66px] left-[172px] h-[10px] w-[10px] rounded-full bg-[#2d4c23]" />

              <div className="absolute bottom-[24px] left-[132px] h-[30px] w-[52px] rounded-[18px_16px_14px_14px] bg-[#84b95f] shadow-[inset_0_-5px_0_rgba(0,0,0,0.10)]" />
              <div className="absolute bottom-[18px] left-[126px] h-[16px] w-[64px] rounded-full bg-[#6da347]/80 blur-[1px]" />

              <div className="portal-loader-wheel absolute bottom-[18px] left-[94px] h-[26px] w-[26px] rounded-full border-[5px] border-[#2e4230] bg-[#495d49]" />
              <div className="portal-loader-wheel absolute bottom-[18px] left-[156px] h-[24px] w-[24px] rounded-full border-[4px] border-[#2e4230] bg-[#495d49]" />

              <div className="portal-loader-blade absolute bottom-[14px] left-[122px] h-[12px] w-[72px] rounded-full bg-[radial-gradient(circle,#9bd474_0_18%,transparent_19%)] opacity-75" />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="rounded-full border border-white/70 bg-white/75 px-4 py-2 text-xs font-medium tracking-[0.08em] text-[#466147] shadow-sm">
              Syncing the portal while our groundskeeper does one clean pass.
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .portal-loader-track {
          animation: portal-loader-drive 5.8s linear infinite;
        }

        .portal-loader-wheel {
          animation: portal-loader-spin 0.8s linear infinite;
        }

        .portal-loader-blade {
          animation: portal-loader-blade 0.35s linear infinite;
        }

        @keyframes portal-loader-drive {
          0% {
            transform: translateX(0);
          }
          48% {
            transform: translateX(270px);
          }
          52% {
            transform: translateX(270px) scaleX(-1);
          }
          100% {
            transform: translateX(0) scaleX(-1);
          }
        }

        @keyframes portal-loader-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes portal-loader-blade {
          from {
            transform: scaleX(0.92) rotate(0deg);
            opacity: 0.55;
          }
          50% {
            transform: scaleX(1.08) rotate(180deg);
            opacity: 0.9;
          }
          to {
            transform: scaleX(0.92) rotate(360deg);
            opacity: 0.55;
          }
        }
      `}</style>
    </section>
  );
}
